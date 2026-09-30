import os
import uuid
import json
import logging
from flask import Flask, render_template, request, jsonify
from PIL import Image, ImageDraw
from dotenv import load_dotenv
import torch
import torch.nn as nn
import torchvision.transforms as transforms

# HF Spaces ZeroGPU workaround
try:
    import spaces
    @spaces.GPU
    def _dummy_gpu_function():
        pass
except ImportError:
    pass

# ─── Konfigurasi Logging ──────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("HaloTani")

# ─── Muat .env ────────────────────────────────────────────────────────────────
load_dotenv()

# ─── Path ─────────────────────────────────────────────────────────────────────
BASE_DIR        = os.path.abspath(os.path.dirname(__file__))
STATIC_FOLDER   = os.path.join(BASE_DIR, 'static')
TEMPLATE_FOLDER = os.path.join(BASE_DIR, 'templates')
UPLOADS_FOLDER  = os.path.join(STATIC_FOLDER, 'uploads')
MODEL_PATH      = os.path.join(BASE_DIR, 'halotani-resnet9.pth')
CLASS_NAMES_PATH = os.path.join(BASE_DIR, 'class_names.json')

os.makedirs(UPLOADS_FOLDER, exist_ok=True)
logger.info(f"Folder uploads siap di: {UPLOADS_FOLDER}")

# ─── Flask ────────────────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=STATIC_FOLDER,
    static_url_path='/static',
    template_folder=TEMPLATE_FOLDER
)
app.config['UPLOAD_FOLDER'] = UPLOADS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# ─── Arsitektur ResNet9 ───────────────────────────────────────────────────────
# Harus identik dengan arsitektur saat model dilatih

def conv_block(in_channels, out_channels, pool=False):
    """Blok konvolusi standar: Conv2d → BatchNorm → ReLU [→ MaxPool]."""
    layers = [
        nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=True),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(inplace=True),
    ]
    if pool:
        layers.append(nn.MaxPool2d(2))
    return nn.Sequential(*layers)


class ResNet9(nn.Module):
    """ResNet9 — arsitektur ringan untuk klasifikasi gambar."""

    def __init__(self, in_channels: int, num_classes: int):
        super().__init__()

        self.conv1 = conv_block(in_channels, 64)           # 64 × H × W
        self.conv2 = conv_block(64, 128, pool=True)        # 128 × H/2 × W/2
        self.res1  = nn.Sequential(
            conv_block(128, 128),
            conv_block(128, 128),
        )

        self.conv3 = conv_block(128, 256, pool=True)       # 256 × H/4 × W/4
        self.conv4 = conv_block(256, 512, pool=True)       # 512 × H/8 × W/8
        self.res2  = nn.Sequential(
            conv_block(512, 512),
            conv_block(512, 512),
        )

        self.classifier = nn.Sequential(
            nn.MaxPool2d(4),                               # 512 × 1 × 1  (asumsi input 128 px)
            nn.Flatten(),
            nn.Linear(512, num_classes),
        )

    def forward(self, x):
        out = self.conv1(x)
        out = self.conv2(out)
        out = self.res1(out) + out
        out = self.conv3(out)
        out = self.conv4(out)
        out = self.res2(out) + out
        out = self.classifier(out)
        return out


# ─── Muat Model & Class Names (sekali saat startup) ───────────────────────────
ml_model      = None
class_names   = []
device        = torch.device("cpu")

# Preprocessing identik dengan training PlantVillage ResNet9
# Input 32x32: setelah 3x MaxPool2d(2) → 4x4, lalu MaxPool2d(4) → 1x1 → flatten = 512
TRANSFORM = transforms.Compose([
    transforms.Resize((32, 32)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std =[0.229, 0.224, 0.225],
    ),
])

def load_model():
    """Memuat model ResNet9 dan daftar kelas. Dipanggil sekali saat startup."""
    global ml_model, class_names

    # Muat class names
    if not os.path.exists(CLASS_NAMES_PATH):
        logger.error(f"class_names.json tidak ditemukan di: {CLASS_NAMES_PATH}")
        return

    with open(CLASS_NAMES_PATH, encoding='utf-8') as f:
        class_names = json.load(f)
    logger.info(f"Berhasil memuat {len(class_names)} kelas dari class_names.json")

    # Auto-unzip model jika belum diekstrak (Untuk Render.com / GitHub)
    if not os.path.exists(MODEL_PATH) and os.path.exists('halotani-resnet9.zip'):
        import zipfile
        logger.info("Mengekstrak halotani-resnet9.zip...")
        with zipfile.ZipFile('halotani-resnet9.zip', 'r') as zip_ref:
            zip_ref.extractall('.')
            
    # Muat model
    if not os.path.exists(MODEL_PATH):
        logger.warning(f"halotani-resnet9.pth tidak ditemukan di: {MODEL_PATH}")
        return

    try:
        num_classes = len(class_names)
        model = ResNet9(in_channels=3, num_classes=num_classes)
        state_dict = torch.load(MODEL_PATH, map_location=device)
        model.load_state_dict(state_dict)
        model.to(device)
        model.eval()
        ml_model = model
        logger.info(f"Model ResNet9 berhasil dimuat ({num_classes} kelas) dari {MODEL_PATH}")
    except Exception as e:
        logger.error(f"Gagal memuat model: {e}")
        ml_model = None


load_model()


# ─── Helper: Format nama kelas ─────────────────────────────────────────────────
# Mengubah 'Tomato___Early_blight' → 'Tomat: Hawar Awal'
CLASS_DISPLAY = {
    # Apel
    'Apple___Apple_scab'                                    : 'Apel: Kudis Apel (Apple Scab)',
    'Apple___Black_rot'                                     : 'Apel: Busuk Hitam',
    'Apple___Cedar_apple_rust'                              : 'Apel: Karat Cedar-Apel',
    'Apple___healthy'                                       : 'Apel: Sehat',
    # Blueberry
    'Blueberry___healthy'                                   : 'Blueberry: Sehat',
    # Ceri
    'Cherry_(including_sour)___Powdery_mildew'              : 'Ceri: Embun Tepung (Powdery Mildew)',
    'Cherry_(including_sour)___healthy'                     : 'Ceri: Sehat',
    # Jagung
    'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot'    : 'Jagung: Bercak Daun Abu-abu (Cercospora)',
    'Corn_(maize)___Common_rust_'                           : 'Jagung: Karat Umum',
    'Corn_(maize)___Northern_Leaf_Blight'                   : 'Jagung: Hawar Daun Utara',
    'Corn_(maize)___healthy'                                : 'Jagung: Sehat',
    # Anggur
    'Grape___Black_rot'                                     : 'Anggur: Busuk Hitam',
    'Grape___Esca_(Black_Measles)'                          : 'Anggur: Esca (Campak Hitam)',
    'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)'            : 'Anggur: Hawar Daun (Isariopsis)',
    'Grape___healthy'                                       : 'Anggur: Sehat',
    # Jeruk
    'Orange___Haunglongbing_(Citrus_greening)'              : 'Jeruk: Penyakit HLB (Citrus Greening)',
    # Persik
    'Peach___Bacterial_spot'                                : 'Persik: Bercak Bakteri',
    'Peach___healthy'                                       : 'Persik: Sehat',
    # Paprika
    'Pepper,_bell___Bacterial_spot'                         : 'Paprika: Bercak Bakteri',
    'Pepper,_bell___healthy'                                : 'Paprika: Sehat',
    # Kentang
    'Potato___Early_blight'                                 : 'Kentang: Hawar Awal (Early Blight)',
    'Potato___Late_blight'                                  : 'Kentang: Hawar Akhir (Late Blight)',
    'Potato___healthy'                                      : 'Kentang: Sehat',
    # Raspberry
    'Raspberry___healthy'                                   : 'Raspberry: Sehat',
    # Kedelai
    'Soybean___healthy'                                     : 'Kedelai: Sehat',
    # Labu
    'Squash___Powdery_mildew'                               : 'Labu: Embun Tepung (Powdery Mildew)',
    # Stroberi
    'Strawberry___Leaf_scorch'                              : 'Stroberi: Hangus Daun (Leaf Scorch)',
    'Strawberry___healthy'                                  : 'Stroberi: Sehat',
    # Tomat
    'Tomato___Bacterial_spot'                               : 'Tomat: Bercak Bakteri',
    'Tomato___Early_blight'                                 : 'Tomat: Hawar Awal (Early Blight)',
    'Tomato___Late_blight'                                  : 'Tomat: Hawar Akhir (Late Blight)',
    'Tomato___Leaf_Mold'                                    : 'Tomat: Jamur Daun (Leaf Mold)',
    'Tomato___Septoria_leaf_spot'                           : 'Tomat: Bercak Septoria',
    'Tomato___Spider_mites Two-spotted_spider_mite'         : 'Tomat: Tungau Laba-laba',
    'Tomato___Target_Spot'                                  : 'Tomat: Bercak Target',
    'Tomato___Tomato_Yellow_Leaf_Curl_Virus'                : 'Tomat: Virus Keriting Daun Kuning',
    'Tomato___Tomato_mosaic_virus'                          : 'Tomat: Virus Mosaik Tomat',
    'Tomato___healthy'                                      : 'Tomat: Sehat',
}

def format_class(raw_name: str) -> str:
    """Mengembalikan nama kelas yang ramah ditampilkan."""
    return CLASS_DISPLAY.get(raw_name, raw_name.replace('___', ': ').replace('_', ' '))


# ─── Sistem Instruksi Gemini ───────────────────────────────────────────────────
SYSTEM_INSTRUCTION = (
    "Anda adalah Dokter Tani, pakar pertanian organik Indonesia. "
    "Jawablah pertanyaan petani dengan bahasa Indonesia yang mudah dipahami. "
    "Maksimal 3 paragraf pendek. "
    "Jangan gunakan format markdown tebal/miring yang berlebihan agar mudah dirender di UI web. "
    "Fokus pada solusi praktis dan ramah lingkungan."
)


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route('/', methods=['GET'])
def index():
    """Halaman utama HaloTani."""
    return render_template('index.html')


@app.route('/detect', methods=['POST'])
def detect():
    """
    Endpoint deteksi penyakit/hama tanaman menggunakan ResNet9.
    Menerima: multipart/form-data dengan field 'image'.
    Mengembalikan: JSON {status, image_url, detections, top_prediction, confidence}.
    """
    if 'image' not in request.files:
        return jsonify({
            "status": "error",
            "message": "Field 'image' tidak ditemukan dalam request."
        }), 400

    file = request.files['image']
    if not file or file.filename.strip() == '':
        return jsonify({
            "status": "error",
            "message": "Tidak ada file gambar yang dipilih."
        }), 400

    # ── Validasi & simpan file ──────────────────────────────────────────────
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.bmp'):
        ext = '.jpg'

    uid           = uuid.uuid4().hex[:10]
    safe_name     = f"upload_{uid}{ext}"
    saved_path    = os.path.join(UPLOADS_FOLDER, safe_name)

    try:
        file.save(saved_path)
    except Exception as e:
        logger.error(f"Gagal menyimpan file: {e}")
        return jsonify({"status": "error", "message": f"Gagal menyimpan gambar: {e}"}), 500

    # ── Pastikan model tersedia ─────────────────────────────────────────────
    if ml_model is None:
        if not os.path.exists(MODEL_PATH):
            return jsonify({
                "status": "error",
                "message": (
                    "Model 'halotani-resnet9.pth' tidak ditemukan. "
                    "Letakkan file model di folder utama aplikasi HaloTani."
                )
            }), 404
        return jsonify({
            "status": "error",
            "message": "Model gagal dimuat. Periksa log server untuk detail."
        }), 500

    # ── Inferensi ResNet9 ───────────────────────────────────────────────────
    try:
        img = Image.open(saved_path).convert('RGB')

        # Simpan salinan untuk ditampilkan (gambar asli + label overlay)
        res_name  = f"res_{safe_name}"
        res_path  = os.path.join(UPLOADS_FOLDER, res_name)

        # Jalankan inferensi
        tensor = TRANSFORM(img).unsqueeze(0).to(device)  # [1, 3, 128, 128]

        with torch.no_grad():
            logits = ml_model(tensor)               # [1, num_classes]
            probs  = torch.softmax(logits, dim=1)
            topk   = torch.topk(probs, k=min(3, len(class_names)))

        top_indices = topk.indices[0].tolist()
        top_probs   = topk.values[0].tolist()

        # Prediksi terbaik
        top_idx   = top_indices[0]
        top_prob  = top_probs[0]
        top_raw   = class_names[top_idx] if top_idx < len(class_names) else f"Kelas {top_idx}"
        top_label = format_class(top_raw)

        # Semua top-3 deteksi
        detections = []
        for idx, prob in zip(top_indices, top_probs):
            if prob < 0.05:       # abaikan kelas dengan confidence < 5%
                continue
            raw  = class_names[idx] if idx < len(class_names) else f"Kelas {idx}"
            name = format_class(raw)
            detections.append(f"{name} ({prob * 100:.1f}%)")

        if not detections:
            detections = ["Tidak teridentifikasi (confidence terlalu rendah)"]

        # ── Buat gambar hasil dengan label overlay ──────────────────────────
        display_img = img.copy()
        draw = ImageDraw.Draw(display_img)

        # Kotak label di sudut kiri atas
        label_text = f"{top_label}  {top_prob*100:.1f}%"
        text_bbox  = draw.textbbox((0, 0), label_text)
        text_w     = text_bbox[2] - text_bbox[0]
        text_h     = text_bbox[3] - text_bbox[1]
        pad = 8

        # Warna berdasarkan kondisi (hijau = sehat, merah = penyakit)
        is_healthy = 'healthy' in top_raw.lower() or 'sehat' in top_label.lower()
        box_color  = (34, 139, 34) if is_healthy else (200, 30, 30)

        draw.rectangle([0, 0, text_w + pad*2, text_h + pad*2], fill=box_color)
        draw.text((pad, pad), label_text, fill=(255, 255, 255))

        display_img.save(res_path)

        image_url = f"/static/uploads/{res_name}"
        return jsonify({
            "status"         : "success",
            "image_url"      : image_url,
            "detections"     : detections,
            "top_prediction" : top_label,
            "confidence"     : round(top_prob * 100, 1),
            "is_healthy"     : is_healthy,
        }), 200

    except Exception as e:
        logger.error(f"Gagal inferensi: {e}", exc_info=True)
        return jsonify({
            "status" : "error",
            "message": f"Terjadi kesalahan saat analisis gambar: {e}"
        }), 500


@app.route('/chat', methods=['POST'])
def chat():
    """
    Endpoint konsultasi Dokter Tani via Google Gemini AI.
    Menerima: JSON {message: str}
    Mengembalikan: JSON {response: str}
    """
    data         = request.get_json(silent=True) or {}
    user_message = data.get('message', '').strip()

    if not user_message:
        return jsonify({"response": "Silakan ketikkan pertanyaan Anda."}), 400

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({
            "response": (
                "Layanan konsultasi AI belum dikonfigurasi. "
                "Atur GEMINI_API_KEY di file .env untuk mengaktifkan Dokter Tani."
            )
        }), 200

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)

        model    = genai.GenerativeModel(
            model_name        = "gemini-3-flash-preview",
            system_instruction= SYSTEM_INSTRUCTION,
        )
        response = model.generate_content(user_message)
        reply    = response.text.strip() if (response and hasattr(response, 'text')) else ""

        if not reply:
            reply = "Maaf, tidak ada jawaban yang dihasilkan. Coba ulangi pertanyaan Anda."

        return jsonify({"response": reply}), 200

    except Exception as e:
        logger.error(f"Gemini error: {e}")
        return jsonify({
            "response": f"Terjadi kendala pada layanan AI: {e}. Pastikan API Key Gemini Anda valid."
        }), 200


# ─── Entrypoint ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
