chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("popup.js 接收到消息：", request);
});

document.getElementById('analyzeButton').addEventListener('click', () => {
    console.log("分析按钮被点击了！");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: () => {} // 触发 content.js 执行
        });
    });
});