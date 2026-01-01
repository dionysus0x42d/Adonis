/**
 * GVDB 資料庫管理系統 - JavaScript
 * 用於處理前端互動功能
 */

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