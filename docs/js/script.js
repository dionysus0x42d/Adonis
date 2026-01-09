/**
 * GVDB 資料庫管理系統 - JavaScript
 * 用於處理前端互動功能
 */

// API 基礎 URL 配置 - 指向 Replit 後端
const API_BASE = 'https://4e2350e0-a779-41b9-8869-625c6bfb1550-00-3sd666gqw2mxi.sisko.replit.dev';

// 頁面載入完成後執行
document.addEventListener('DOMContentLoaded', function() {
    console.log('GVDB 系統已載入');

    // 自動關閉 Flash 訊息（5秒後）
    const flashMessages = document.querySelectorAll('.flash-message');
    if (flashMessages.length > 0) {
        setTimeout(() => {
            flashMessages.forEach(msg => {
                msg.style.opacity = '0';
                msg.style.transition = 'opacity 0.5s';
                setTimeout(() => msg.remove(), 500);
            });
        }, 5000);
    }
});
