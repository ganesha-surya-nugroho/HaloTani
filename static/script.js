document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let currentStream = null;
    let currentImageBlob = null;
    let PRODUCTS = window.PRODUCTS || []; // PRODUCTS global array expected from HTML

    // --- DOM ELEMENTS ---
    // Navigation
    const navLinks = document.querySelectorAll('[data-page]');
    const pages = document.querySelectorAll('.page-container');
    
    // Mobile Nav
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileNavMenu = document.getElementById('mobile-nav-menu');

    // Camera & Detection
    const cameraFeed = document.getElementById('cameraFeed');
    const captureCanvas = document.getElementById('captureCanvas');
    const capturedPreview = document.getElementById('captured-preview');
    const resultImage = document.getElementById('result-image');
    const btnStartCamera = document.getElementById('btn-start-camera');
    const btnCapture = document.getElementById('btn-capture');
    const btnRetake = document.getElementById('btn-retake');
    const btnAnalyze = document.getElementById('btn-analyze');
    const imageFileInput = document.getElementById('image-file-input');
    const detectionClasses = document.getElementById('detection-classes');
    const detectRecommendedProducts = document.getElementById('detect-recommended-products');
    const cameraZone = document.getElementById('camera-zone');
    const detectLoading = document.getElementById('detect-loading');
    const detectError = document.getElementById('detect-error');
    const detectResultPanel = document.getElementById('detect-result-panel');
    const resultEmptyState = document.getElementById('result-empty-state');
    const modePills = document.querySelectorAll('[data-mode]');

    // Market
    const productsGrid = document.getElementById('product-grid');
    const filterChips = document.querySelectorAll('.filter-pill');
    const marketSearch = document.getElementById('market-search');

    // Chat
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnChatSend = document.getElementById('btn-chat-send');
    const btnClearChat = document.getElementById('btn-clear-chat');
    const quickQuestions = document.querySelectorAll('.btn-quick-question');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- NAVIGATION ---
    function navigateTo(pageId) {
        // Handle pages display
        pages.forEach(page => {
            if (page.id === `page-${pageId}`) {
                page.classList.add('page-active');
                page.style.display = 'block'; 
            } else {
                page.classList.remove('page-active');
                page.style.display = 'none';
            }
        });

        // Handle nav active state
        navLinks.forEach(link => {
            if (link.dataset.page === pageId) {
                link.classList.add('nav-active');
            } else {
                link.classList.remove('nav-active');
            }
        });

        // Specific page initialization
        if (pageId === 'market') {
            renderMarketProducts();
        } else if (pageId === 'chat') {
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Close mobile nav if open
        if (mobileNavMenu && mobileNavMenu.classList.contains('nav-open')) {
            mobileNavMenu.classList.remove('nav-open');
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    // Show initial page
    navigateTo('dashboard');

    // --- MOBILE NAV ---
    if (hamburgerBtn && mobileNavMenu) {
        hamburgerBtn.addEventListener('click', () => {
            mobileNavMenu.classList.toggle('nav-open');
        });
    }

    // --- SECTION 1: CAMERA DETECTION ---
    
    function stopCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
    }

    async function startCamera() {
        stopCamera();
        try {
            currentStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' }, 
                audio: false 
            });
            if (cameraFeed) {
                cameraFeed.srcObject = currentStream;
                cameraFeed.style.display = 'block';
                cameraFeed.play();
            }
            if (capturedPreview) capturedPreview.style.display = 'none';
            if (captureCanvas) captureCanvas.style.display = 'none';
            if (btnCapture) btnCapture.style.display = 'inline-block';
            if (btnRetake) btnRetake.style.display = 'none';
            if (btnAnalyze) btnAnalyze.disabled = true;
            if (btnStartCamera) btnStartCamera.style.display = 'none';
        } catch (err) {
            console.error("Camera error:", err);
            alert("Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.");
        }
    }

    if (btnStartCamera) {
        btnStartCamera.addEventListener('click', startCamera);
    }

    if (btnCapture && cameraFeed && captureCanvas) {
        btnCapture.addEventListener('click', () => {
            // Draw video frame to canvas
            captureCanvas.width = cameraFeed.videoWidth;
            captureCanvas.height = cameraFeed.videoHeight;
            const ctx = captureCanvas.getContext('2d');
            ctx.drawImage(cameraFeed, 0, 0, captureCanvas.width, captureCanvas.height);
            
            // UI updates
            stopCamera();
            cameraFeed.style.display = 'none';
            captureCanvas.style.display = 'block';
            if (capturedPreview) capturedPreview.style.display = 'none';
            
            btnCapture.style.display = 'none';
            if (btnRetake) btnRetake.style.display = 'inline-block';
            if (btnAnalyze) btnAnalyze.disabled = false;
            if (btnStartCamera) btnStartCamera.style.display = 'none';

            // Store as blob
            captureCanvas.toBlob(blob => {
                currentImageBlob = blob;
            }, 'image/jpeg', 0.92);
        });
    }

    if (btnRetake) {
        btnRetake.addEventListener('click', () => {
            currentImageBlob = null;
            if (imageFileInput) imageFileInput.value = '';
            if (capturedPreview) { capturedPreview.src = ''; capturedPreview.style.display = 'none'; }
            // Sembunyikan post-capture-controls
            const postCapture = document.getElementById('post-capture-controls');
            if (postCapture) postCapture.style.display = 'none';
            // Kembali ke kamera
            startCamera();
        });
    }

    if (imageFileInput) {
        imageFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                stopCamera();
                currentImageBlob = file;
                const reader = new FileReader();
                reader.onload = function(event) {
                    // Tampilkan preview gambar di camera zone
                    if (capturedPreview) {
                        capturedPreview.src = event.target.result;
                        capturedPreview.style.display = 'block';
                    }
                    // Sembunyikan video & canvas
                    if (cameraFeed) cameraFeed.style.display = 'none';
                    if (captureCanvas) captureCanvas.style.display = 'none';
                    // Sembunyikan tombol kamera, tampilkan tombol analisis
                    if (btnCapture) btnCapture.style.display = 'none';
                    if (btnStartCamera) btnStartCamera.style.display = 'none';
                    if (btnRetake) btnRetake.style.display = 'none';
                    // Tampilkan post-capture-controls (berisi btn-analyze)
                    const postCapture = document.getElementById('post-capture-controls');
                    if (postCapture) postCapture.style.display = 'flex';
                    if (btnAnalyze) btnAnalyze.disabled = false;
                    // Reset error dan result
                    if (detectError) detectError.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Mode Pills Toggle
    if (modePills) {
        modePills.forEach(pill => {
            pill.addEventListener('click', () => {
                modePills.forEach(p => p.classList.remove('active-mode'));
                pill.classList.add('active-mode');
                
                const mode = pill.dataset.mode;
                if (mode === 'camera') {
                    if (imageFileInput) imageFileInput.style.display = 'none';
                    if (btnStartCamera) btnStartCamera.style.display = 'inline-block';
                } else if (mode === 'upload') {
                    stopCamera();
                    if (cameraFeed) cameraFeed.style.display = 'none';
                    if (captureCanvas) captureCanvas.style.display = 'none';
                    if (btnCapture) btnCapture.style.display = 'none';
                    if (btnRetake) btnRetake.style.display = 'none';
                    if (btnStartCamera) btnStartCamera.style.display = 'none';
                    
                    if (imageFileInput) imageFileInput.style.display = 'block';
                }
            });
        });
    }

    if (btnAnalyze) {
        btnAnalyze.addEventListener('click', async () => {
            if (!currentImageBlob) return;
            
            if (detectLoading) detectLoading.style.display = 'block';
            if (detectError) detectError.style.display = 'none';
            if (detectResultPanel) detectResultPanel.style.display = 'none';
            if (resultEmptyState) resultEmptyState.style.display = 'none';

            const formData = new FormData();
            formData.append('image', currentImageBlob, 'capture.jpg');

            try {
                const response = await fetch('/detect', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                if (detectLoading) detectLoading.style.display = 'none';

                if (response.ok && data) {
                    if (detectResultPanel) detectResultPanel.style.display = 'block';
                    if (resultImage && data.image_url) resultImage.src = data.image_url;
                    
                    if (detectionClasses) {
                        detectionClasses.innerHTML = '';
                        if (data.detections && data.detections.length > 0) {
                            data.detections.forEach(det => {
                                const tag = document.createElement('span');
                                tag.className = 'detection-tag';
                                tag.textContent = det;
                                detectionClasses.appendChild(tag);
                            });
                        } else {
                            detectionClasses.innerHTML = '<span>Tidak ada deteksi</span>';
                        }
                    }

                    // Isi rekomendasi penanganan
                    const recBox = document.getElementById('recommendation-text');
                    if (recBox) {
                        if (data.is_healthy) {
                            recBox.innerHTML = `<strong style="color:#15803d;">Tanaman Sehat</strong> (confidence: ${data.confidence}%)<br><br>Pertahankan rutinitas perawatan saat ini. Lakukan pemantauan rutin, pastikan kebutuhan air dan nutrisi terpenuhi, serta jaga kebersihan area tanam untuk mencegah serangan hama di masa mendatang.`;
                        } else if (data.top_prediction) {
                            recBox.innerHTML = `<strong style="color:#b91c1c;">Terdeteksi: ${data.top_prediction}</strong> (confidence: ${data.confidence}%)<br><br>Segera lakukan pemeriksaan visual pada bagian daun, batang, dan akar tanaman. Isolasi tanaman yang terinfeksi dari tanaman sehat di sekitarnya. Klik <strong>Tanya Dokter Tani</strong> untuk rekomendasi penanganan organik yang spesifik.`;
                        } else {
                            recBox.textContent = 'Tidak dapat menentukan rekomendasi. Coba ambil foto dengan pencahayaan lebih baik dan fokus pada bagian tanaman yang bermasalah.';
                        }
                    }

                    renderRecommendedProducts(data.detections || []);
                } else {
                    throw new Error(data.error || 'Terjadi kesalahan saat deteksi');
                }
            } catch (err) {
                console.error("Detect error:", err);
                if (detectLoading) detectLoading.style.display = 'none';
                if (detectError) {
                    detectError.style.display = 'block';
                    detectError.textContent = err.message || 'Gagal menghubungi server.';
                }
            }
        });
    }
    
    // Global delegation for dynamic buttons in detect results
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-ask-doctor')) {
            navigateTo('chat');
            if (chatInput && detectionClasses) {
                const tags = Array.from(detectionClasses.querySelectorAll('span')).map(s => s.textContent).join(', ');
                const issue = tags || 'masalah';
                chatInput.value = `Saya mendeteksi tanaman saya terkena: ${issue}. Apa solusinya?`;
            }
        }
        if (e.target && e.target.classList.contains('btn-to-market')) {
             navigateTo('market');
        }
    });

    // --- SECTION 2: RECOMMENDED PRODUCTS ---
    function renderRecommendedProducts(detections) {
        if (!detectRecommendedProducts) return;
        detectRecommendedProducts.innerHTML = '';
        
        const text = detections.join(' ').toLowerCase();
        let recommendedIds = [];
        
        // Basic keyword mapping
        if (/(fungi|jamur|bercak|antraknosa|layu|busuk|fusarium)/.test(text)) {
            recommendedIds = [3, 7]; // Example IDs for Trichoderma, Asap Cair
        } else if (/(serangga|kutu|thrips|ulat|aphid|hama)/.test(text)) {
            recommendedIds = [4, 11]; // Example IDs for Neem Oil, Pestisida Tembakau
        } else {
            recommendedIds = [1, 3]; // Default fallback recommendations
        }
        
        const recommended = PRODUCTS.filter(p => recommendedIds.includes(p.id));
        
        recommended.forEach(product => {
            const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f3f4f6%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%239ca3af%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216%22%3E${encodeURIComponent(product.category)}%3C%2Ftext%3E%3C%2Fsvg%3E`;
            const card = document.createElement('div');
            card.className = 'recommended-card product-card';
            card.innerHTML = `
                <img src="/static/images/products/product-${product.id}.jpg" onerror="this.onerror=null; this.src='${fallbackSVG}'" alt="${product.name}" style="width:100%;height:140px;object-fit:cover;">
                <div class="product-info">
                    <h4>${product.name}</h4>
                    <span class="category-badge">${product.category}</span>
                    <p class="price">Rp ${product.price ? product.price.toLocaleString('id-ID') : '0'} / ${product.priceUnit || 'unit'}</p>
                    <button class="btn-to-market">Lihat di Katalog</button>
                </div>
            `;
            detectRecommendedProducts.appendChild(card);
        });
    }

    // --- SECTION 3: MARKETPLACE FILTERING ---
    let currentCategory = 'Semua';

    function createMarketProductCard(product) {
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f3f4f6%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%239ca3af%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216%22%3E${encodeURIComponent(product.category)}%3C%2Ftext%3E%3C%2Fsvg%3E`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="/static/images/products/product-${product.id}.jpg" onerror="this.onerror=null; this.src='${fallbackSVG}'" alt="${product.name}">
            <div class="product-info">
                <h3>${product.name}</h3>
                <span class="category-badge">${product.category}</span>
                <p class="price">Rp ${product.price ? product.price.toLocaleString('id-ID') : '0'} / unit</p>
                <button class="btn-buy" data-id="${product.id}">Beli</button>
            </div>
        `;
        return card;
    }

    function renderMarketProducts(searchTerm = '') {
        if (!productsGrid) return;
        productsGrid.innerHTML = '';
        
        const filtered = PRODUCTS.filter(p => {
            const matchCat = currentCategory === 'Semua' || p.category === currentCategory;
            const matchSearch = p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchCat && matchSearch;
        });
        
        filtered.forEach(p => {
            productsGrid.appendChild(createMarketProductCard(p));
        });
    }

    if (filterChips) {
        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                filterChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentCategory = chip.dataset.category || 'Semua';
                renderMarketProducts(marketSearch ? marketSearch.value : '');
            });
        });
    }

    if (marketSearch) {
        marketSearch.addEventListener('input', (e) => {
            renderMarketProducts(e.target.value);
        });
    }

    // --- SECTION 4: CHAT (Dokter Tani) ---
    const WELCOME_MSG = 'Selamat datang. Saya Dokter Tani, konsultan pertanian organik berbasis AI. Silakan sampaikan pertanyaan Anda seputar hama, penyakit tanaman, pemupukan, atau teknik budidaya organik.';
    
    function appendMessage(sender, text) {
        if (!chatMessages) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = sender === 'user' ? 'chat-message user-message' : 'chat-message bot-message';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Escape HTML & format basic markdown (bold, italic, newlines)
        const formattedText = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/\n/g, "<br>");
            
        contentDiv.innerHTML = formattedText;
        msgDiv.appendChild(contentDiv);

        // Masukkan pesan sebelum typing-indicator (yang kini ada di dalam chatMessages)
        if (typingIndicator && typingIndicator.parentNode === chatMessages) {
            chatMessages.insertBefore(msgDiv, typingIndicator);
        } else {
            chatMessages.appendChild(msgDiv);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function initChat() {
        if (chatMessages && (chatMessages.children.length === 0 || (chatMessages.children.length === 1 && typingIndicator))) {
            appendMessage('bot', WELCOME_MSG);
        }
    }
    initChat();

    async function sendChatMessage(text) {
        if (!text.trim()) return;
        
        appendMessage('user', text);
        if (chatInput) chatInput.value = '';
        
        if (typingIndicator) typingIndicator.style.display = 'block';
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await response.json();
            
            if (typingIndicator) typingIndicator.style.display = 'none';
            
            if (response.ok && data) {
                appendMessage('bot', data.response || data.reply || 'Maaf, terjadi kesalahan pada sistem kami.');
            } else {
                appendMessage('bot', 'Maaf, terjadi kesalahan pada sistem kami.');
            }
        } catch (err) {
            console.error('Chat error:', err);
            if (typingIndicator) typingIndicator.style.display = 'none';
            appendMessage('bot', 'Gagal menghubungi server.');
        }
    }

    if (btnChatSend) {
        btnChatSend.addEventListener('click', () => {
            if (chatInput) sendChatMessage(chatInput.value);
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage(chatInput.value);
            }
        });
    }

    if (quickQuestions) {
        quickQuestions.forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                if (prompt) {
                    if (chatInput) chatInput.value = prompt;
                    sendChatMessage(prompt);
                }
            });
        });
    }

    if (btnClearChat) {
        btnClearChat.addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin menghapus riwayat chat?')) {
                if (chatMessages) {
                    const messages = Array.from(chatMessages.querySelectorAll('.msg-card'));
                    messages.forEach(msg => msg.remove());
                    appendMessage('bot', WELCOME_MSG);
                }
            }
        });
    }
});
