// renderer.js (전체 최종 코드 - 자동 추가 기능 수정됨)

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
    let activePromptEditor = null;
    let dragState = {};
    let expandedAlbumIds = new Set();

    // --- 함수 정의 ---

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

    const handlePasteAsPlainText = (event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    const updateSelectionVisuals = () => {
        const isMultiSelect = selectedItemIds.size > 1;
        document.querySelectorAll('.prompt-row').forEach(row => {
            const id = parseInt(row.dataset.itemId, 10);
            row.classList.toggle('selected', isMultiSelect && selectedItemIds.has(id));
        });
    };

    const buildAlbumTree = (albums) => {
        const albumMap = new Map();
        albums.filter(a => a.id !== 1).forEach(album => {
            albumMap.set(album.id, { ...album, children: [] });
        });
        const tree = [];
        for (const album of albumMap.values()) {
            if (album.parent_id && albumMap.has(album.parent_id)) {
                albumMap.get(album.parent_id).children.push(album);
            } else {
                tree.push(album);
            }
        }
        return tree;
    };

    const renderAlbums = () => {
        const albumTree = buildAlbumTree(currentAlbums);
        albumList.innerHTML = '';
        const allItemsAlbum = { id: 1, name: '모든 항목' };
        const favoritesAlbum = { id: 'favorites', name: '⭐ 즐겨찾기' };

        [allItemsAlbum, favoritesAlbum].forEach(album => {
            albumList.appendChild(createAlbumListItem(album));
        });

        const renderNode = (albumNode, parentElement) => {
            const li = createAlbumListItem(albumNode);
            if (albumNode.children.length > 0) {
                li.classList.add('has-children');
                if (!expandedAlbumIds.has(albumNode.id)) {
                    li.classList.add('collapsed');
                }
                
                const childUl = document.createElement('ul');
                albumNode.children.sort((a,b) => a.name.localeCompare(b.name)).forEach(child => renderNode(child, childUl));
                li.appendChild(childUl);
            }
            parentElement.appendChild(li);
        };
        albumTree.sort((a,b) => a.name.localeCompare(b.name)).forEach(albumNode => renderNode(albumNode, albumList));
    };
    
    const createAlbumListItem = (album) => {
        const li = document.createElement('li');
        li.dataset.id = album.id;
        
        const content = document.createElement('div');
        content.className = 'album-content';
    
        if (album.id == selectedAlbumId) {
            li.classList.add('active');
        }
    
        content.addEventListener('click', (e) => {
            if (!e.target.classList.contains('toggle-children') && !e.target.matches('.album-name input')) {
                handleAlbumSelect(album.id);
            }
        });
    
        const isStandardAlbum = album.id !== 1 && album.id !== 'favorites';
    
        if (isStandardAlbum) {
            content.draggable = true;
            content.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('application/json-album-id', album.id);
                e.dataTransfer.effectAllowed = 'move';
                dragState.draggedId = album.id;
            });
        }
        
        content.addEventListener('dragenter', (e) => e.preventDefault());
    
        content.addEventListener('dragover', (e) => {
            e.preventDefault();
            const isItemDrag = e.dataTransfer.types.includes('text/plain');
            
            if (dragState.draggedId && (album.id == dragState.draggedId || li.querySelector(`li[data-id="${dragState.draggedId}"]`))) {
                return;
            }
    
            albumList.querySelectorAll('.drop-on, .drop-above, .drop-below').forEach(el => el.classList.remove('drop-on', 'drop-above', 'drop-below'));

            const rect = content.getBoundingClientRect();
            const verticalPos = (e.clientY - rect.top) / rect.height;
    
            dragState.targetLi = li;
            if (dragState.draggedId && isStandardAlbum) {
                 if (verticalPos > 0.25 && verticalPos < 0.75) {
                    dragState.mode = 'on';
                } else if (verticalPos <= 0.25) {
                    dragState.mode = 'above';
                } else {
                    dragState.mode = 'below';
                }
            } else if (isItemDrag) {
                dragState.mode = 'on';
            }
            
            if (dragState.targetLi && dragState.mode) {
                dragState.targetLi.classList.add(`drop-${dragState.mode}`);
            }
        });
    
        content.addEventListener('dragend', () => {
            dragState = {};
            albumList.querySelectorAll('.drop-on, .drop-above, .drop-below').forEach(el => el.classList.remove('drop-on', 'drop-above', 'drop-below'));
        });
        albumList.addEventListener('dragleave', () => {
            albumList.querySelectorAll('.drop-on, .drop-above, .drop-below').forEach(el => el.classList.remove('drop-on', 'drop-above', 'drop-below'));
        });

        content.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
    
            const draggedAlbumId = parseInt(e.dataTransfer.getData('application/json-album-id'), 10);
            const draggedItemIdsStr = e.dataTransfer.getData('text/plain');
            
            if (draggedItemIdsStr) {
                const itemIds = JSON.parse(draggedItemIdsStr);
                const targetAlbumId = album.id;
                if(targetAlbumId === 1) return;

                if (targetAlbumId === 'favorites') {
                    for (const id of itemIds) await window.electronAPI.invoke('update-item-favorite-state', { id, isFavorite: true });
                    showToast(`${itemIds.length}개의 항목을 즐겨찾기에 추가했습니다.`, 'success');
                } else {
                    await window.electronAPI.invoke('update-item-album', { itemIds, albumId: targetAlbumId });
                    showToast(`${itemIds.length}개의 항목을 '${album.name}' 앨범으로 이동했습니다.`, 'success');
                }
                
                await handleAlbumSelect(selectedAlbumId);
                
            } else if (draggedAlbumId) {
                let newParentId = null;
                if (dragState.mode === 'on') {
                    newParentId = album.id;
                } else if (dragState.mode === 'above' || dragState.mode === 'below') {
                    const targetAlbum = currentAlbums.find(a => a.id === album.id);
                    newParentId = targetAlbum ? targetAlbum.parent_id : null;
                } else {
                     return;
                }
    
                currentAlbums = await window.electronAPI.invoke('update-album-parent', { id: draggedAlbumId, parentId: newParentId });
                renderAlbums();
            }
    
            albumList.querySelectorAll('.drop-on, .drop-above, .drop-below').forEach(el => el.classList.remove('drop-on', 'drop-above', 'drop-below'));
            dragState = {};
        });
    
        const toggleBtn = document.createElement('span');
        toggleBtn.className = 'toggle-children';
        toggleBtn.textContent = '▼';
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentLi = e.target.closest('li.has-children');
            const albumId = parseInt(parentLi.dataset.id, 10);
            parentLi.classList.toggle('collapsed');
            
            if (parentLi.classList.contains('collapsed')) {
                expandedAlbumIds.delete(albumId);
            } else {
                expandedAlbumIds.add(albumId);
            }
        });
    
        const nameSpan = document.createElement('span');
        nameSpan.className = 'album-name';
        nameSpan.textContent = album.name;
    
        content.appendChild(toggleBtn);
        content.appendChild(nameSpan);
    
        if (isStandardAlbum) {
            content.addEventListener('dblclick', (e) => {
                if(e.target.matches('input')) return;
                const existingInput = document.querySelector('.album-name input');
                if (existingInput) existingInput.blur();
                
                content.classList.add('editing');
                const oldName = album.name;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = oldName;
                nameSpan.textContent = '';
                nameSpan.appendChild(input);
                input.focus();
                input.select();
    
                const saveChanges = async () => {
                    const newName = input.value.trim();
                    if (newName && newName !== oldName) {
                        showToast(`앨범 이름이 변경되었습니다.`, 'success');
                        const albumInState = currentAlbums.find(a => a.id === album.id);
                        if (albumInState) albumInState.name = newName;
                        await window.electronAPI.invoke('update-album-name', { id: album.id, name: newName });
                    }
                    renderAlbums();
                };
    
                const handleKeydown = (e) => {
                    if (e.key === 'Enter') input.blur();
                    if (e.key === 'Escape') { input.value = oldName; input.blur(); }
                }
    
                input.addEventListener('blur', saveChanges, { once: true });
                input.addEventListener('keydown', handleKeydown);
            });
    
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-album-btn';
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); handleAlbumDelete(album.id, album.name); });
            content.appendChild(deleteBtn);
        }
    
        li.appendChild(content);
        return li;
    };

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
        row.addEventListener('click', (e) => { if (e.target.closest('.drag-handle, button, [contenteditable="true"], .prompt-editor-popover')) { return; } selectedItemIds.clear(); selectedItemIds.add(item.id); updateSelectionVisuals(); });

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
        
        previewText.title = '클릭하여 프롬프트 수정';
        previewText.addEventListener('click', (e) => {
            if (promptList.classList.contains('grid-view')) {
                e.stopPropagation();
                openGridPromptEditor(item, previewText);
            }
        });

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
    
    const closeActivePromptEditor = () => {
        if (activePromptEditor) {
            activePromptEditor.close();
        }
    };

    const openGridPromptEditor = (item, targetElement) => {
        closeActivePromptEditor();
        const popover = document.createElement('div');
        popover.className = 'prompt-editor-popover';
        const textarea = document.createElement('textarea');
        textarea.value = item.prompt || '';
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'popover-buttons';
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '저장';
        saveBtn.className = 'popover-btn primary';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '취소';
        cancelBtn.className = 'popover-btn';
        buttonContainer.append(cancelBtn, saveBtn);
        popover.append(textarea, buttonContainer);
        document.body.appendChild(popover);
        const rect = targetElement.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const popoverWidth = Math.max(rect.width, 250);
        let finalLeft = rect.left;
        if (rect.left + popoverWidth > window.innerWidth) {
            finalLeft = window.innerWidth - popoverWidth - 10;
        }
        let finalTop = rect.bottom + 5;
        if (finalTop + popoverRect.height > window.innerHeight) {
            finalTop = rect.top - popoverRect.height - 5;
        }
        popover.style.left = `${finalLeft}px`;
        popover.style.top = `${finalTop}px`;
        popover.style.width = `${popoverWidth}px`;
        textarea.focus();
        textarea.select();
        const close = () => {
            popover.remove();
            document.removeEventListener('click', handleOutsideClick, true);
            activePromptEditor = null;
        };
        const save = async () => {
            const newPrompt = textarea.value.trim();
            if (newPrompt !== (item.prompt || '').trim()) {
                const currentItem = currentItems.find(i => i.id === item.id);
                if (currentItem) {
                    currentItem.prompt = newPrompt;
                    targetElement.textContent = newPrompt;
                    await window.electronAPI.invoke('update-item-text', { id: item.id, title: currentItem.title, prompt: newPrompt });
                    showToast('프롬프트를 수정했습니다.');
                }
            }
            close();
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
            }
        };
        const handleOutsideClick = (e) => {
            if (!popover.contains(e.target) && e.target !== targetElement) {
                close();
            }
        };
        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', close);
        textarea.addEventListener('keydown', handleKeyDown);
        setTimeout(() => { document.addEventListener('click', handleOutsideClick, true); }, 0);
        activePromptEditor = { close };
    };

    const setupDragAndDrop = (element, itemId) => {
        element.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); element.classList.add('dragover'); });
        element.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); element.classList.remove('dragover'); });
        element.addEventListener('drop', async (e) => { e.preventDefault(); e.stopPropagation(); element.classList.remove('dragover'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) { const arrayBuffer = await file.arrayBuffer(); const result = await window.electronAPI.invoke('save-image-from-data', { arrayBuffer, fileName: file.name }); if (result && result.newPath) { const item = currentItems.find(i => i.id === itemId); await window.electronAPI.invoke('update-item-image', { id: itemId, imagePath: result.newPath }); if (item) item.imagePath = result.newPath; if (result.prompt) { const currentTitle = item ? item.title : '새 제목'; await window.electronAPI.invoke('update-item-text', { id: itemId, title: currentTitle, prompt: result.prompt }); if (item) item.prompt = result.prompt; showToast('이미지에서 프롬프트를 자동으로 추출했습니다.', 'success'); } else { showToast('이미지를 등록했습니다.'); } applyFiltersAndSort(); } } });
    };

    const openLightbox = (imageUrl) => { lightboxImage.src = imageUrl; lightbox.style.display = 'flex'; };
    const applyShowHiddenState = () => { promptList.classList.toggle('hiding-enabled', !showHiddenToggle.checked); };
    const applyFiltersAndSort = () => {
        closeActivePromptEditor();
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
    
    const handleAlbumSelect = async (albumId) => {
        if (selectedAlbumId === albumId) return;
        closeActivePromptEditor();
        selectedAlbumId = albumId;
        
        // ★★★ 수정: Main 프로세스에 현재 선택된 앨범 ID 알리기
        window.electronAPI.send('album-selected', selectedAlbumId);
        
        let current = currentAlbums.find(a => a.id == albumId);
        while (current && current.parent_id) {
            expandedAlbumIds.add(current.parent_id);
            current = currentAlbums.find(a => a.id === current.parent_id);
        }

        selectedItemIds.clear();
        currentItems = await window.electronAPI.invoke('get-items-by-album', albumId);
        
        renderAlbums();
        applyFiltersAndSort();
    };

    const handleAlbumDelete = async (albumId, albumName) => { if (confirm(`'${albumName}' 앨범을 정말 삭제하시겠습니까?\n앨범 안의 모든 항목은 '모든 항목'으로 이동되고, 하위 앨범은 최상위로 이동됩니다.`)) { expandedAlbumIds.delete(albumId); currentAlbums = await window.electronAPI.invoke('delete-album', albumId); showToast(`'${albumName}' 앨범을 삭제했습니다.`); if (selectedAlbumId == albumId) { await handleAlbumSelect(1); } else { renderAlbums(); } } };
    
    const handleAddItem = async () => { 
        const newItem = await window.electronAPI.invoke('add-item', selectedAlbumId); 
        if (newItem) { 
            await handleAlbumSelect(selectedAlbumId);
            setTimeout(() => { 
                const newRow = promptList.querySelector(`.prompt-row[data-item-id="${newItem.id}"]`); 
                if (newRow) { 
                    const titleEl = newRow.querySelector('.title-input'); 
                    if(titleEl) titleEl.focus(); 
                } 
            }, 100); 
        } 
    };
    
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
            
            if (isInputFocused && (e.target.id === 'modal-input' || e.target.parentElement.classList.contains('prompt-editor-popover'))) return;

            switch (e.key) {
                case 'Escape':
                    if (activePromptEditor) {
                        closeActivePromptEditor();
                    } else if (!modalContainer.classList.contains('hidden')) {
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
        
        // ★★★ 추가: 앱 시작 시 기본 선택 앨범 ID를 Main에 알림
        window.electronAPI.send('album-selected', selectedAlbumId);

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

        window.electronAPI.on('item-auto-added', async (newItem) => {
            showToast('클립보드에서 새 항목을 추가했습니다.', 'success');
            const currentlySelected = selectedAlbumId;
            currentAlbums = await window.electronAPI.invoke('get-albums');
            currentItems = await window.electronAPI.invoke('get-items-by-album', currentlySelected);
            renderAlbums();
            applyFiltersAndSort();
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