const { contextBridge, ipcRenderer } = require('electron');

// contextBridge를 사용하여 main 프로세스와 renderer 프로세스 간의 안전한 통신 채널을 설정합니다.
// window.electronAPI 라는 전역 객체를 통해 노출됩니다.
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Renderer -> Main (응답이 필요한 비동기 통신)
     * 렌더러 프로세스에서 main 프로세스로 데이터를 보내고, 처리 결과를 Promise로 반환받습니다.
     * 예: 데이터베이스에서 데이터를 조회하는 경우
     * @param {string} channel - 통신 채널 이름
     * @param {*} data - 보낼 데이터
     * @returns {Promise<any>} main 프로세스의 처리 결과
     */
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),

    /**
     * Renderer -> Main (단방향 통신)
     * 렌더러 프로세스에서 main 프로세스로 데이터를 보내기만 하고, 응답을 기다리지 않습니다.
     * 예: 토글 스위치 상태 변경을 알리는 경우
     * @param {string} channel - 통신 채널 이름
     * @param {*} data - 보낼 데이터
     */
    send: (channel, data) => ipcRenderer.send(channel, data),

    /**
     * Main -> Renderer (main으로부터 오는 데이터를 수신)
     * main 프로세스에서 보낸 데이터를 수신할 리스너(콜백 함수)를 등록합니다.
     * 예: 클립보드 감시로 새 아이템이 추가되었음을 알리는 경우
     * @param {string} channel - 수신할 채널 이름
     * @param {Function} callback - 데이터를 받았을 때 실행할 콜백 함수
     */
    on: (channel, callback) => {
        // 채널에 대한 리스너를 등록하고, 수신된 데이터를 콜백 함수에 그대로 전달합니다.
        ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
});