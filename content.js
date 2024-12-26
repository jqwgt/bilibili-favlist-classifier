console.log("content.js 开始执行");

chrome.runtime.sendMessage({ action: "testMessage", message: "Hello from content.js" }, () => {
    if (chrome.runtime.lastError) {
        console.error("发送消息失败:", chrome.runtime.lastError);
    } else {
        console.log("成功发送测试消息");
    }
});