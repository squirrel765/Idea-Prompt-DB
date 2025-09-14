const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');

// --- 사용자 정의 모듈 ---
const db = require('./database');
const { extractPromptFromImage } = require('./imageParser');

// --- 설정 및 경로 초기화 ---
// electron-store 인스턴스 생성. 사용자 설정을 ~/.config/[app-name]/config.json에 저장합니다.
const store = new Store();

// 설정 파일에서 사용자 데이터 경로를 가져옵니다. 만약 설정된 값이 없으면 기본 경로를 사용합니다.
const defaultDataPath = path.join(app.getPath('documents'), 'IdeaPromptData');
const userDataPath = store.get('userDataPath', defaultDataPath);

// 이미지들이 저장될 최종 경로를 설정합니다.
const imagesPath = path.join(userDataPath, 'images');
// 이미지 저장 폴더가 존재하지 않으면 생성합니다.
if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
}

// 메인 윈도우 객체를 전역으로 선언합니다.
let mainWindow;

// Electron 윈도우를 생성하고 초기화하는 함수입니다.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, 
    height: 800,
    minWidth: 940, // 창의 최소 너비 설정
    minHeight: 600, // 창의 최소 높이 설정
    webPreferences: {
      // preload.js 스크립트를 렌더러 프로세스보다 먼저 로드합니다.
      preload: path.join(__dirname, 'preload.js'),
      // 보안을 위해 nodeIntegration은 비활성화하고 contextIsolation은 활성화합니다.
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // 애플리케이션의 기본 메뉴(파일, 편집 등)를 제거합니다.
  mainWindow.removeMenu();
  // index.html 파일을 윈도우에 로드합니다.
  mainWindow.loadFile('index.html');
  
  // 개발자 도구를 열려면 아래 줄의 주석을 해제하세요.
  // mainWindow.webContents.openDevTools();
}

// --- 클립보드 자동 추가 관련 상태 변수 및 로직 ---
let clipboardInterval = null;
let lastImage = clipboard.readImage();
let lastText = clipboard.readText();
let lastAutoAddedItemId = null;

async function checkClipboard() {
    // 1. 클립보드의 이미지가 변경되었는지 확인합니다.
    const currentImage = clipboard.readImage();
    if (!currentImage.isEmpty() && currentImage.toDataURL() !== lastImage.toDataURL()) {
        console.log('새로운 이미지가 클립보드에서 감지되었습니다.');
        lastImage = currentImage;
        lastText = ''; // 이미지 변경 시, 텍스트 추적은 초기화

        const buffer = currentImage.toPNG();
        const newFileName = `${crypto.randomUUID()}.png`;
        const newPath = path.join(imagesPath, newFileName);
        fs.writeFileSync(newPath, buffer);

        // DB에 기본 아이템 추가
        const newItem = db.addItem(1);
        // 추가된 아이템의 이미지 경로 업데이트
        db.updateItemImage({ id: newItem.id, imagePath: newPath });
        
        // 저장된 이미지 파일에서 프롬프트 메타데이터 파싱 시도
        const promptFromImage = await extractPromptFromImage(newPath);
        if (promptFromImage) {
            console.log('파싱된 프롬프트를 DB에 업데이트합니다.');
            db.updateItemText({ id: newItem.id, title: '새 제목', prompt: promptFromImage });
        }
        
        // 방금 추가된 아이템의 ID를 기록하여, 이후 텍스트가 복사될 경우 해당 아이템에 연결
        lastAutoAddedItemId = newItem.id;

        // 최종 데이터를 DB에서 다시 가져와 렌더러 프로세스로 전송
        const finalItem = db.getItem(newItem.id);
        if (finalItem) {
            mainWindow.webContents.send('item-auto-added', finalItem);
        } else {
            console.error(`자동 추가된 아이템(ID: ${newItem.id})을 DB에서 찾지 못했습니다.`);
        }
        return; // 이미지 처리 완료 후 함수 종료
    }

    // 2. 클립보드의 텍스트가 변경되었는지 확인합니다.
    const currentText = clipboard.readText();
    // 조건: 방금 이미지가 추가되었고, 텍스트가 변경되었으며, 해당 아이템의 프롬프트가 아직 기본값일 때만 실행
    if (lastAutoAddedItemId && currentText && currentText !== lastText) {
        const existingItem = db.getItem(lastAutoAddedItemId);
        if (existingItem && existingItem.prompt === '프롬프트를 입력하세요...') {
            console.log(`기존 아이템(${lastAutoAddedItemId})에 클립보드 텍스트로 프롬프트를 추가합니다.`);
            lastText = currentText;
    
            db.updateItemText({ id: lastAutoAddedItemId, title: existingItem.title, prompt: currentText });
            
            // 렌더러로 프롬프트가 업데이트 되었음을 알림
            mainWindow.webContents.send('item-prompt-updated', { id: lastAutoAddedItemId, prompt: currentText });
            lastAutoAddedItemId = null; // 텍스트까지 성공적으로 추가되었으므로 ID 초기화
        }
    }
}

// --- IPC 핸들러 등록 (렌더러 프로세스와의 통신) ---

// 클립보드 자동 추가 기능 토글
ipcMain.on('auto-add-toggle-changed', (event, isEnabled) => {
    if (isEnabled) {
        if (!clipboardInterval) {
            console.log('클립보드 자동 추가 감시를 시작합니다.');
            lastImage = clipboard.readImage();
            lastText = clipboard.readText();
            lastAutoAddedItemId = null;
            clipboardInterval = setInterval(checkClipboard, 1000); // 1초마다 클립보드 확인
        }
    } else {
        if (clipboardInterval) {
            console.log('클립보드 자동 추가 감시를 중지합니다.');
            clearInterval(clipboardInterval);
            clipboardInterval = null;
        }
    }
});

// 데이터 조회
ipcMain.handle('get-initial-data', () => ({ albums: db.getAlbums(), items: db.getItemsByAlbum(1) }));
ipcMain.handle('get-items-by-album', (event, albumId) => db.getItemsByAlbum(albumId));

// 앨범 관리
ipcMain.handle('add-album', (event, name) => { db.addAlbum(name); return db.getAlbums(); });
ipcMain.handle('delete-album', (event, id) => { db.deleteAlbum(id); return db.getAlbums(); });
ipcMain.handle('update-album-name', (event, { id, name }) => {
    db.updateAlbumName({ id, name });
    return db.getAlbums(); // 변경된 최신 앨범 목록을 반환
});

// 아이템 관리
ipcMain.handle('add-item', (event, albumId) => db.addItem(albumId));
ipcMain.handle('update-item-text', (event, data) => db.updateItemText(data));
ipcMain.handle('update-item-hidden-state', (event, data) => db.updateItemHiddenState(data));
ipcMain.handle('update-item-favorite-state', (event, data) => db.updateItemFavoriteState(data));
ipcMain.handle('update-item-album', (event, data) => db.updateItemAlbum(data));

// 아이템 삭제 (연결된 이미지 파일도 함께 삭제)
ipcMain.handle('delete-items', (event, itemIds) => {
    const imagesToDelete = db.deleteItems(itemIds);
    imagesToDelete.forEach(imgPath => {
        if (imgPath && imgPath.startsWith(imagesPath) && fs.existsSync(imgPath)) {
            try {
                fs.unlinkSync(imgPath);
            } catch (err) {
                console.error(`이미지 파일 삭제 실패: ${imgPath}`, err);
            }
        }
    });
});

// 아이템 이미지 업데이트 (기존 이미지 파일 삭제)
ipcMain.handle('update-item-image', (event, data) => {
    const item = db.getItemImagePath(data.id);
    const oldImagePath = item ? item.imagePath : null;
    db.updateItemImage(data);
    if (oldImagePath && oldImagePath.startsWith(imagesPath) && fs.existsSync(oldImagePath)) {
        try {
            fs.unlinkSync(oldImagePath);
        } catch (err) {
            console.error(`기존 이미지 파일 삭제 실패: ${oldImagePath}`, err);
        }
    }
});

// 드래그앤드롭으로 들어온 이미지 저장 및 프롬프트 파싱
ipcMain.handle('save-image-from-data', async (event, { arrayBuffer, fileName }) => {
    try {
        const buffer = Buffer.from(arrayBuffer);
        const fileExtension = path.extname(fileName);
        const newFileName = `${crypto.randomUUID()}${fileExtension}`;
        const newPath = path.join(imagesPath, newFileName);
        fs.writeFileSync(newPath, buffer);

        // 파일 저장 후 즉시 프롬프트 파싱
        const prompt = await extractPromptFromImage(newPath);

        // 이미지 경로와 파싱된 프롬프트를 함께 객체로 반환
        return { newPath, prompt };
    } catch (error) {
        console.error("이미지 파일 저장 실패:", error);
        return null;
    }
});

// --- Electron 앱 생명주기 관리 ---
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // macOS가 아닌 경우, 모든 창이 닫히면 앱을 종료합니다.
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // macOS에서 독 아이콘을 클릭했을 때 창이 없으면 새로 생성합니다.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});