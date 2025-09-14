document.addEventListener('DOMContentLoaded', () => {
    // --- Element 선택 ---
    const albumList = document.getElementById('album-list');
    const addAlbumBtn = document.getElementById('add-album-btn');
    const promptList = document.getElementById('prompt-list');
    const addPromptBtn = document.getElementById('add-prompt-btn');
    const searchInput = document.getElementById('search-input');
    const toggleViewBtn = document.getElementById('toggle-view-btn');
    const sortOptions = document.getElementById('sort-options');
    const showHiddenToggle = document.getElementById('show-hidden-toggle');
    const autoAddToggle = document.getElementById('auto-add-toggle');
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxClose = document.getElementById('lightbox-close');
    const modalContainer = document.getElementById('modal-container');
    const modalInput = document.getElementById('modal-input');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const toastContainer = document.getElementById('toast-container');

    // --- 상태 관리 변수 ---
    let currentAlbums = [];
    let currentItems = [];
    let selectedAlbumId = 1; // '모든 항목'이 기본값
    let selectedItemIds = new Set();

    // --- 함수 정의 ---

    /**
     * 화면 우측 하단에 잠시 나타나는 알림 메시지(토스트)를 표시합니다.
     * @param {string} message - 표시할 메시지
     * @param {string} [type='info'] - 메시지 타입 ('info', 'success', 'error')
     */
    const showToast = (message, type = 'info') => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }, 10);
    };

    /**
     * 붙여넣기 시 서식을 제거하고 일반 텍스트만 삽입하는 함수
     * @param {ClipboardEvent} event - paste 이벤트 객체
     */
    const handlePasteAsPlainText = (event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    /**
     * 다중 선택(2개 이상)일 때만 아이템에 .selected 클래스를 적용/제거합니다.
     */
    const updateSelectionVisuals = () => {
        const isMultiSelect = selectedItemIds.size > 1;
        document.querySelectorAll('.prompt-row').forEach(row => {
            const id = parseInt(row.dataset.itemId, 10);
            row.classList.toggle('selected', isMultiSelect && selectedItemIds.has(id));
        });
    };

    /**
     * 앨범 목록을 렌더링하고 이벤트(클릭, 더블클릭, 드래그-드롭)를 설정합니다.
     */
    const renderAlbums = () => {
        albumList.innerHTML = '';
        const favoriteAlbum = { id: 'favorites', name: '⭐ 즐겨찾기' };
        const allAlbums = [favoriteAlbum, ...currentAlbums];

        allAlbums.forEach(album => {
            const li = document.createElement('li');
            li.textContent = album.name;
            li.dataset.id = album.id;
            if (album.id == selectedAlbumId) li.classList.add('active');

            li.addEventListener('click', () => handleAlbumSelect(album.id));

            if (album.id !== 1 && album.id !== 'favorites') {
                li.addEventListener('dblclick', () => {
                    li.classList.add('editing');
                    const oldName = album.name;
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = oldName;
                    li.innerHTML = '';
                    li.appendChild(input);
                    input.focus();

                    const saveChanges = async () => {
                        const newName = input.value.trim();
                        if (newName && newName !== oldName) {
                            currentAlbums = await window.electronAPI.invoke('update-album-name', { id: album.id, name: newName });
                            showToast(`앨범 이름이 변경되었습니다.`, 'success');
                        }
                        renderAlbums();
                    };

                    input.addEventListener('blur', saveChanges);
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') input.blur();
                        if (e.key === 'Escape') { 
                            input.value = oldName;
                            input.blur();
                        }
                    });
                });
            }

            li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('album-dragover'); });
            li.addEventListener('dragleave', () => li.classList.remove('album-dragover'));
            li.addEventListener('drop', async (e) => {
                e.preventDefault();
                li.classList.remove('album-dragover');
                const itemIds = JSON.parse(e.dataTransfer.getData('text/plain'));
                const targetAlbumId = album.id;
                
                if (targetAlbumId === 'favorites') {
                    for (const id of itemIds) {
                        await window.electronAPI.invoke('update-item-favorite-state', { id, isFavorite: true });
                        const item = currentItems.find(i => i.id === id);
                        if(item) item.isFavorite = 1;
                    }
                    showToast(`${itemIds.length}개의 항목을 즐겨찾기에 추가했습니다.`, 'success');
                } else {
                    await window.electronAPI.invoke('update-item-album', { itemIds, albumId: targetAlbumId });
                    showToast(`${itemIds.length}개의 항목을 '${album.name}' 앨범으로 이동했습니다.`, 'success');
                }
                
                if (selectedAlbumId != 1) {
                    currentItems = currentItems.filter(item => !itemIds.includes(item.id));
                }
                applyFiltersAndSort();
                selectedItemIds.clear();
                updateSelectionVisuals();
            });

            if (album.id !== 1 && album.id !== 'favorites') {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-album-btn';
                deleteBtn.textContent = '×';
                deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); handleAlbumDelete(album.id, album.name); });
                li.appendChild(deleteBtn);
            }
            albumList.appendChild(li);
        });
    };
    
    /**
     * 아이템 목록을 화면에 렌더링합니다.
     */
    const renderItems = (items) => {
        promptList.innerHTML = '';
        items.forEach(item => {
            const itemElement = createNewPromptRow(item);
            itemElement.classList.add('fade-in');
            promptList.appendChild(itemElement);
        });
        updateSelectionVisuals();
        applyShowHiddenState();
    };

    /**
     * 하나의 프롬프트 아이템 DOM 요소를 생성하고 모든 이벤트를 설정합니다.
     */
    const createNewPromptRow = (item) => {
        const row = document.createElement('div');
        row.className = 'prompt-row';
        row.dataset.itemId = item.id;
        if (item.isHidden) row.classList.add('is-hidden');
    
        const handle = document.createElement('div');
        handle.className = 'drag-handle';
        handle.draggable = true;
        handle.addEventListener('dragstart', (e) => { e.stopPropagation(); if (!selectedItemIds.has(item.id)) { selectedItemIds.clear(); selectedItemIds.add(item.id); updateSelectionVisuals(); } const itemIds = Array.from(selectedItemIds); e.dataTransfer.setData('text/plain', JSON.stringify(itemIds)); e.dataTransfer.effectAllowed = 'move'; });
        handle.addEventListener('click', (e) => { e.stopPropagation(); const isCtrlPressed = e.ctrlKey || e.metaKey; if (isCtrlPressed) { selectedItemIds.has(item.id) ? selectedItemIds.delete(item.id) : selectedItemIds.add(item.id); } else { if (selectedItemIds.has(item.id) && selectedItemIds.size === 1) { selectedItemIds.clear(); } else { selectedItemIds.clear(); selectedItemIds.add(item.id); } } updateSelectionVisuals(); });
        row.addEventListener('click', (e) => { if (e.target.closest('.drag-handle, button, [contenteditable="true"]')) { return; } selectedItemIds.clear(); selectedItemIds.add(item.id); updateSelectionVisuals(); });

        const dropZone = document.createElement('div');
        dropZone.className = 'image-drop-zone';
        setupDragAndDrop(dropZone, item.id);
    
        const promptSection = document.createElement('div');
        promptSection.className = 'prompt-section';
        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'title-input-wrapper';
        const titleInput = document.createElement('div');
        titleInput.className = 'title-input';
        titleInput.contentEditable = true;
        titleInput.spellcheck = false;
        titleWrapper.append(titleInput);
        
        const promptDetailWrapper = document.createElement('div');
        promptDetailWrapper.className = 'prompt-detail-input-wrapper';
        const promptDetailInput = document.createElement('div');
        promptDetailInput.className = 'prompt-detail-input';
        promptDetailInput.contentEditable = true;
        promptDetailInput.spellcheck = false;
        const detailCopyBtn = createCopyButton(promptDetailInput, 'detail-copy');
        promptDetailWrapper.append(promptDetailInput, detailCopyBtn);
        
        const previewSection = document.createElement('div');
        previewSection.className = 'preview-section';
        const previewText = document.createElement('span');
        previewText.className = 'prompt-preview-text';
        const previewCopyBtn = createCopyButton(promptDetailInput);
        previewSection.append(previewText, previewCopyBtn);

        titleInput.addEventListener('paste', handlePasteAsPlainText);
        promptDetailInput.addEventListener('paste', handlePasteAsPlainText);
    
        let debounceTimer;
        [titleInput, promptDetailInput].forEach(el => {
            el.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { const currentItem = currentItems.find(i => i.id === item.id); if (currentItem) { currentItem.title = titleInput.textContent; currentItem.prompt = promptDetailInput.textContent; window.electronAPI.invoke('update-item-text', { id: item.id, title: currentItem.title, prompt: currentItem.prompt }); } }, 500); if(previewText) previewText.textContent = promptDetailInput.textContent; });
        });
        
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = `favorite-btn ${item.isFavorite ? 'active' : ''}`;
        favoriteBtn.innerHTML = item.isFavorite ? '❤️' : '♡';
        favoriteBtn.addEventListener('click', async (e) => { e.stopPropagation(); item.isFavorite = !item.isFavorite; await window.electronAPI.invoke('update-item-favorite-state', { id: item.id, isFavorite: item.isFavorite }); favoriteBtn.innerHTML = item.isFavorite ? '❤️' : '♡'; favoriteBtn.classList.toggle('active', item.isFavorite); showToast(item.isFavorite ? '즐겨찾기에 추가했습니다.' : '즐겨찾기에서 제거했습니다.'); if (selectedAlbumId === 'favorites' && !item.isFavorite) { currentItems = currentItems.filter(i => i.id !== item.id); applyFiltersAndSort(); } });
    
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!selectedItemIds.has(item.id)) { selectedItemIds.clear(); selectedItemIds.add(item.id); } handleDeleteSelectedItems(); });
    
        const hideBtn = document.createElement('button');
        hideBtn.className = 'hide-btn';
        hideBtn.innerHTML = item.isHidden ? '🙈' : '👁️';
        hideBtn.addEventListener('click', (e) => { e.stopPropagation(); item.isHidden = !item.isHidden; window.electronAPI.invoke('update-item-hidden-state', { id: item.id, isHidden: item.isHidden }); row.classList.toggle('is-hidden'); hideBtn.innerHTML = item.isHidden ? '🙈' : '👁️'; applyShowHiddenState(); showToast(item.isHidden ? '항목을 숨겼습니다.' : '항목 숨김을 해제했습니다.'); });
    
        titleInput.textContent = item.title;
        promptDetailInput.textContent = item.prompt;
        previewText.textContent = item.prompt;
    
        if (item.imagePath) {
            dropZone.textContent = '';
            const imageUrl = `file://${item.imagePath.replace(/\\/g, '/')}`;
            dropZone.style.backgroundImage = `url('${imageUrl}')`;
            dropZone.addEventListener('click', () => openLightbox(imageUrl));
        } else {
            dropZone.textContent = '예시 그림';
        }
    
        promptSection.append(titleWrapper, promptDetailWrapper, previewSection);
        row.append(handle, dropZone, promptSection, favoriteBtn, deleteBtn, hideBtn);
        return row;
    };
    
    const createCopyButton = (targetElement, additionalClass = '') => {
        const btn = document.createElement('button');
        btn.className = `copy-btn ${additionalClass}`;
        btn.textContent = '📋';
        btn.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(targetElement.textContent).then(() => { btn.textContent = '✅'; showToast('프롬프트가 클립보드에 복사되었습니다.'); setTimeout(() => { btn.textContent = '📋'; }, 1000); }); });
        return btn;
    };

    const setupDragAndDrop = (element, itemId) => {
        element.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); element.classList.add('dragover'); });
        element.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); element.classList.remove('dragover'); });
        element.addEventListener('drop', async (e) => { e.preventDefault(); e.stopPropagation(); element.classList.remove('dragover'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) { const arrayBuffer = await file.arrayBuffer(); const result = await window.electronAPI.invoke('save-image-from-data', { arrayBuffer, fileName: file.name }); if (result && result.newPath) { const item = currentItems.find(i => i.id === itemId); await window.electronAPI.invoke('update-item-image', { id: itemId, imagePath: result.newPath }); if (item) item.imagePath = result.newPath; if (result.prompt) { const currentTitle = item ? item.title : '새 제목'; await window.electronAPI.invoke('update-item-text', { id: itemId, title: currentTitle, prompt: result.prompt }); if (item) item.prompt = result.prompt; showToast('이미지에서 프롬프트를 자동으로 추출했습니다.', 'success'); } else { showToast('이미지를 등록했습니다.'); } applyFiltersAndSort(); } } });
    };

    const openLightbox = (imageUrl) => { lightboxImage.src = imageUrl; lightbox.style.display = 'flex'; };
    const applyShowHiddenState = () => { promptList.classList.toggle('hiding-enabled', !showHiddenToggle.checked); };
    const applyFiltersAndSort = () => {
        let itemsToRender = [...currentItems];
        const searchTerm = searchInput.value.toLowerCase().trim();
        if (searchTerm) {
            itemsToRender = itemsToRender.filter(item => (item.title?.toLowerCase().includes(searchTerm)) || (item.prompt?.toLowerCase().includes(searchTerm)));
        }
        const sortBy = sortOptions.value;
        if (sortBy === 'newest') itemsToRender.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        else if (sortBy === 'oldest') itemsToRender.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        else if (sortBy === 'az') itemsToRender.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        renderItems(itemsToRender);
    };

    const showAlbumPrompt = () => {
        return new Promise((resolve) => {
            modalContainer.classList.remove('hidden');
            modalInput.value = '';
            setTimeout(() => modalInput.focus(), 50);
            const handleConfirm = () => { cleanup(); resolve(modalInput.value); };
            const handleCancel = () => { cleanup(); resolve(null); };
            const handleKeydown = (e) => { if (e.key === 'Enter') handleConfirm(); else if (e.key === 'Escape') handleCancel(); };
            const cleanup = () => { modalConfirmBtn.removeEventListener('click', handleConfirm); modalCancelBtn.removeEventListener('click', handleCancel); modalContainer.removeEventListener('keydown', handleKeydown); modalContainer.classList.add('hidden'); };
            modalConfirmBtn.addEventListener('click', handleConfirm);
            modalCancelBtn.addEventListener('click', handleCancel);
            modalContainer.addEventListener('keydown', handleKeydown);
        });
    };
    
    const handleAddAlbum = async () => { const name = await showAlbumPrompt(); if (name && name.trim()) { currentAlbums = await window.electronAPI.invoke('add-album', name.trim()); renderAlbums(); showToast(`'${name.trim()}' 앨범이 추가되었습니다.`, 'success'); } };
    
    // ★★★ 수정된 부분 ★★★
    const handleAlbumSelect = async (albumId) => {
        // 이미 선택된 앨범을 다시 클릭하면 아무것도 하지 않음
        if (selectedAlbumId === albumId) return;

        selectedAlbumId = albumId;
        selectedItemIds.clear();
        currentItems = await window.electronAPI.invoke('get-items-by-album', albumId);

        // 앨범 목록 전체를 다시 그리는 대신, active 클래스만 교체하여 효율성 증대 및 버그 해결
        albumList.querySelectorAll('li').forEach(li => {
            // dataset.id는 문자열, albumId는 숫자일 수 있으므로 == 비교 사용
            li.classList.toggle('active', li.dataset.id == albumId);
        });

        applyFiltersAndSort();
    };

    const handleAlbumDelete = async (albumId, albumName) => { if (confirm(`'${albumName}' 앨범을 정말 삭제하시겠습니까?\n앨범 안의 항목들은 '모든 항목'으로 이동됩니다.`)) { currentAlbums = await window.electronAPI.invoke('delete-album', albumId); showToast(`'${albumName}' 앨범을 삭제했습니다.`); if (selectedAlbumId == albumId) { await handleAlbumSelect(1); } else { renderAlbums(); } } };
    const handleAddItem = async () => { const newItem = await window.electronAPI.invoke('add-item', selectedAlbumId); if (newItem) { currentItems.unshift(newItem); applyFiltersAndSort(); setTimeout(() => { const newRow = promptList.querySelector(`.prompt-row[data-item-id="${newItem.id}"]`); if (newRow) { const titleEl = newRow.querySelector('.title-input'); if(titleEl) titleEl.focus(); } }, 100); } };
    
    async function handleDeleteSelectedItems() {
        if (selectedItemIds.size === 0) return;
        const idsToDelete = Array.from(selectedItemIds);
        if (confirm(`선택된 ${idsToDelete.length}개의 항목을 정말 삭제하시겠습니까?`)) {
            await window.electronAPI.invoke('delete-items', idsToDelete);
            currentItems = currentItems.filter(i => !idsToDelete.includes(i.id));
            selectedItemIds.clear();
            applyFiltersAndSort();
            showToast(`${idsToDelete.length}개의 항목을 삭제했습니다.`);
        }
    }

    function setupGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            const isInputFocused = e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName);
            
            if (isInputFocused && e.target.id === 'modal-input') return;

            switch (e.key) {
                case 'Escape':
                    if (!modalContainer.classList.contains('hidden')) {
                        modalCancelBtn.click();
                    } else if (selectedItemIds.size > 0) {
                        selectedItemIds.clear();
                        updateSelectionVisuals();
                    }
                    break;
                case 'Delete':
                case 'Backspace':
                    if (!isInputFocused) {
                        e.preventDefault();
                        handleDeleteSelectedItems();
                    }
                    break;
            }

            if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    function setupSidebarResizing() {
        const sidebar = document.getElementById('sidebar');
        const resizer = document.getElementById('resizer');
        if (!sidebar || !resizer) return;

        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.userSelect = 'none';
            document.body.style.pointerEvents = 'none';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        function handleMouseMove(e) {
            if (!isResizing) return;
            const newWidth = Math.max(180, Math.min(e.clientX, 500));
            sidebar.style.width = `${newWidth}px`;
        }

        function handleMouseUp() {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
        }
    }

    async function initializeApp() {
        const { albums, items } = await window.electronAPI.invoke('get-initial-data');
        currentAlbums = albums;
        currentItems = items;
        
        renderAlbums();
        applyFiltersAndSort();
        
        setupGlobalShortcuts();
        setupSidebarResizing();
        
        addAlbumBtn.addEventListener('click', handleAddAlbum);
        addPromptBtn.addEventListener('click', handleAddItem);
        searchInput.addEventListener('input', applyFiltersAndSort);
        sortOptions.addEventListener('change', applyFiltersAndSort);
        showHiddenToggle.addEventListener('change', applyShowHiddenState);
        toggleViewBtn.addEventListener('click', () => {
            promptList.classList.toggle('list-view');
            promptList.classList.toggle('grid-view');
            toggleViewBtn.textContent = promptList.classList.contains('list-view') ? 'Grid View' : 'List View';
        });
        lightboxClose.addEventListener('click', () => lightbox.style.display = 'none');
        autoAddToggle.addEventListener('change', () => {
            window.electronAPI.send('auto-add-toggle-changed', autoAddToggle.checked);
        });

        window.electronAPI.on('item-auto-added', (newItem) => {
            const shouldDisplay = selectedAlbumId == 1 || 
                                  (newItem.album_id === null && selectedAlbumId == 1) || 
                                  selectedAlbumId == newItem.album_id || 
                                  (selectedAlbumId === 'favorites' && newItem.isFavorite);
            if (shouldDisplay) {
                currentItems.unshift(newItem);
                applyFiltersAndSort();
                showToast('클립보드에서 새 항목을 추가했습니다.', 'success');
            }
        });
        window.electronAPI.on('item-prompt-updated', ({ id, prompt }) => {
            const item = currentItems.find(i => i.id === id);
            if (!item) return;
            item.prompt = prompt;
            const row = promptList.querySelector(`.prompt-row[data-item-id="${id}"]`);
            if (!row) return;
            const promptEl = row.querySelector('.prompt-detail-input');
            if(promptEl) promptEl.textContent = prompt;
            const previewEl = row.querySelector('.prompt-preview-text');
            if(previewEl) previewEl.textContent = prompt;
        });
    }

    initializeApp();
});