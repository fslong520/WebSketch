// 这是 content.js 的剪贴板复制部分（在 img.onload 回调中）

          // 导出为 PNG
          const dataUrl = temp.toDataURL('image/png');

          // 下载文件
          const link = document.createElement('a');
          link.download = `paint-${Date.now()}.png`;
          link.href = dataUrl;
          link.click();
          console.log('WebSketch: 文件已下载');

          // 复制到剪贴板（发送到 background script 处理）
          console.log('WebSketch: 开始复制到剪贴板...');
          chrome.runtime.sendMessage(
            { action: 'copyToClipboard', dataUrl: dataUrl },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('WebSketch: 发送到 background 失败:', chrome.runtime.lastError);
                showCopySuccessTip('已保存截图（剪贴板复制失败）');
                exitScreenshotMode();
              } else if (response && response.success) {
                console.log('WebSketch: 剪贴板复制成功');
                showCopySuccessTip('已保存并复制到剪贴板');
                exitScreenshotMode();
              } else {
                console.error('WebSketch: 剪贴板复制失败:', response ? response.error : '未知错误');
                showCopySuccessTip('已保存截图（剪贴板复制失败）');
                exitScreenshotMode();
              }
            }
          );
