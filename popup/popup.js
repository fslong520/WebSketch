/**
 * 网页绘图助手 - Popup Script
 * 点击扩展图标直接触发绘图模式
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusIcon = document.getElementById('status-icon');
  const statusLabel = document.getElementById('status-label');
  const statusDesc = document.getElementById('status-desc');
  const toggleBtn = document.getElementById('toggle-btn');
  const btnText = document.getElementById('btn-text');

  async function getStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return false;
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
      return res?.enabled || false;
    } catch { return false; }
  }

  function updateUI(enabled) {
    if (enabled) {
      statusIcon.classList.add('active');
      statusLabel.classList.add('active');
      statusLabel.textContent = '已启用';
      statusDesc.textContent = '当前页面可以使用绘图工具';
      toggleBtn.classList.add('active');
      btnText.textContent = '关闭绘图';
    } else {
      statusIcon.classList.remove('active');
      statusLabel.classList.remove('active');
      statusLabel.textContent = '未启用';
      statusDesc.textContent = '点击下方按钮开启绘图模式';
      toggleBtn.classList.remove('active');
      btnText.textContent = '开启绘图';
    }
  }

  // 初始化状态
  const enabled = await getStatus();
  updateUI(enabled);

  // 点击切换
  toggleBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      statusDesc.textContent = '此页面不支持绘图功能';
      return;
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      updateUI(res?.enabled || false);
    } catch {
      // content script 未加载，手动注入
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/content.css'] });
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
        updateUI(res?.enabled || false);
      } catch {
        statusDesc.textContent = '无法在此页面启用绘图';
      }
    }
  });
});
