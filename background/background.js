/**
 * WebSketch - Background Service Worker
 * 点击扩展图标直接开启绘图模式
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
    return;
  }

  async function tryToggle(tabId) {
    await chrome.tabs.sendMessage(tabId, { action: 'toggle' });
  }

  async function injectAndToggle(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
    // 等注入完成
    await new Promise(r => setTimeout(r, 100));
    await tryToggle(tabId);
  }

  try {
    await tryToggle(tab.id);
  } catch {
    try {
      await injectAndToggle(tab.id);
    } catch (e) {
      console.log('Failed:', e);
    }
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') console.log('WebSketch 已安装');
  else if (details.reason === 'update') console.log('WebSketch 已更新');
});

// 监听截图请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    // 在 background 中执行截图
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('截图失败:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl: dataUrl });
      }
    });
    return true; // 保持消息通道开放
  }

  // 监听剪贴板复制请求
  if (request.action === 'copyToClipboard') {
    console.log('Background: 收到剪贴板复制请求，使用 executeScript 注入主世界');

    // 使用 chrome.scripting.executeScript 在 MAIN 世界执行剪贴板操作
    // MAIN 世界中 navigator.clipboard 肯定可用
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: (dataUrl) => {
        return fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]))
          .then(() => ({ success: true }))
          .catch(err => ({ success: false, error: err.message }));
      },
      args: [request.dataUrl]
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error('Background: 注入脚本失败:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else if (results && results[0]) {
        sendResponse(results[0].result || { success: false, error: '未知错误' });
      } else {
        sendResponse({ success: false, error: '注入脚本无返回' });
      }
    });

    return true; // 保持消息通道开放
  }
});
