// ===== 教师端逻辑 =====

const socket = io();
const MAX_SLOTS = 6;
let currentSlots = new Array(MAX_SLOTS).fill(null);

// ===== DOM 引用 =====
const qrCode = document.getElementById('qrCode');
const qrLoading = document.querySelector('.qr-loading');
const studentUrl = document.getElementById('studentUrl');
const onlineCount = document.getElementById('onlineCount');
const slotsGrid = document.getElementById('slotsGrid');
const slotsInfo = document.getElementById('slotsInfo');
const projectionMode = document.getElementById('projectionMode');
const projectionGrid = document.getElementById('projectionGrid');
const toast = document.getElementById('toast');
// 放大查看模态框
const viewerModal = document.getElementById('viewerModal');
const viewerBackdrop = document.getElementById('viewerBackdrop');
const viewerContent = document.getElementById('viewerContent');
const viewerClose = document.getElementById('viewerClose');
const viewerHeader = document.getElementById('viewerHeader');
const viewerBody = document.getElementById('viewerBody');

// ===== 加载二维码 =====
async function loadQRCode() {
    try {
        const res = await fetch('/api/qrcode');
        const data = await res.json();
        if (data.qr) {
            qrCode.src = data.qr;
            qrCode.style.display = 'block';
            qrLoading.style.display = 'none';
            studentUrl.textContent = data.url;
        }
    } catch (err) {
        qrLoading.textContent = '二维码加载失败';
    }
}

// ===== 主动获取当前卡位状态 =====
async function loadCurrentSlots() {
    try {
        const res = await fetch('/api/slots');
        const data = await res.json();
        if (data.slots) {
            renderSlots(data.slots);
        }
    } catch (err) {
        console.error('获取卡位状态失败:', err);
    }
}

// ===== 初始化6个卡位 =====
function initSlots() {
    slotsGrid.innerHTML = '';
    for (let i = 0; i < MAX_SLOTS; i++) {
        slotsGrid.appendChild(createEmptySlot(i));
    }
}

// ===== 创建空卡位 =====
function createEmptySlot(index) {
    const card = document.createElement('div');
    card.className = 'slot-card empty';
    card.dataset.index = index;
    card.dataset.state = 'empty';
    card.innerHTML = `
        <span class="slot-number">卡位 ${index + 1}</span>
        <span class="empty-icon">📱</span>
        <span class="empty-text">等待加入</span>
    `;
    return card;
}

// ===== 生成占用卡位的内容HTML =====
function buildOccupiedHTML(slot) {
    const content = slot.content;
    const isOnline = slot.online !== false;
    let contentHTML = '';
    if (!content) {
        contentHTML = '<div class="slot-no-content">尚未投屏内容</div>';
    } else {
        if (content.text) {
            contentHTML += `<div class="slot-text">${escapeHtml(content.text.text)}</div>`;
        }
        if (content.image) {
            contentHTML += `<div class="slot-image"><img src="${content.image.url}" alt="投屏图片"></div>`;
        }
        if (!content.text && !content.image) {
            contentHTML = '<div class="slot-no-content">尚未投屏内容</div>';
        }
    }

    // 在线/离线状态标签
    const statusBadge = isOnline
        ? '<span class="slot-online-tag">在线</span>'
        : '<span class="slot-offline-tag">离线</span>';

    // 统一显示"清空"按钮（清空内容 + 移除学员）
    const clearBtn = `<button class="slot-action-btn danger" data-action="clear" data-index="${slot.index}" title="清空卡位（移除学员和内容）">✕</button>`;

    return `
        <div class="slot-header ${isOnline ? '' : 'offline'}">
            <div class="slot-info">
                <span class="slot-num-badge">${slot.index + 1}</span>
                <span class="slot-name">${escapeHtml(slot.studentName)}</span>
                ${statusBadge}
            </div>
            <div class="slot-actions">
                ${clearBtn}
            </div>
        </div>
        <div class="slot-content">
            ${contentHTML}
        </div>
    `;
}

// ===== 创建已占用卡位（带动画，仅在空→占用时使用） =====
function createOccupiedSlot(slot) {
    const card = document.createElement('div');
    const isOnline = slot.online !== false;
    card.className = `slot-card occupied slot-new${isOnline ? '' : ' offline-slot'}`;
    card.dataset.index = slot.index;
    card.dataset.state = 'occupied';
    card.dataset.signature = getSlotSignature(slot);
    card.innerHTML = buildOccupiedHTML(slot);
    return card;
}

// ===== 生成卡位签名（用于判断内容是否变化） =====
function getSlotSignature(slot) {
    if (!slot || !slot.occupied) return 'empty';
    const c = slot.content;
    const online = slot.online !== false;
    let sig = `occupied:${slot.studentName}:${online ? 'on' : 'off'}:`;
    if (c) {
        if (c.text) sig += `t:${c.text.text}|`;
        if (c.image) sig += `i:${c.image.url}|`;
    }
    return sig;
}

// ===== 渲染所有卡位（增量更新，避免闪烁） =====
function renderSlots(slotsData) {
    let occupiedCount = 0;
    const existingCards = slotsGrid.children;

    slotsData.forEach((slot, i) => {
        const card = existingCards[i];
        const newSig = getSlotSignature(slot);
        const oldSig = card ? card.dataset.signature : '';

        // 签名相同，无需更新（完全跳过 DOM 操作）
        if (card && newSig === oldSig) {
            if (slot && slot.occupied) occupiedCount++;
            return;
        }

        // 状态变化，需要更新
        const wasOccupied = card && card.dataset.state === 'occupied';
        const isOccupied = slot && slot.occupied;

        if (isOccupied) {
            occupiedCount++;
            if (wasOccupied) {
                // 占用→占用（内容或在线状态变化）：只更新内容，不触发动画
                const isOnline = slot.online !== false;
                card.className = `slot-card occupied${isOnline ? '' : ' offline-slot'}`;
                card.dataset.state = 'occupied';
                card.dataset.signature = newSig;
                card.innerHTML = buildOccupiedHTML(slot);
            } else {
                // 空→占用：创建新卡位（带进入动画）
                const newCard = createOccupiedSlot(slot);
                slotsGrid.replaceChild(newCard, card);
            }
        } else {
            // 占用→空：创建空卡位
            if (wasOccupied) {
                const newCard = createEmptySlot(i);
                slotsGrid.replaceChild(newCard, card);
            } else if (!card) {
                // 空→空 且没有元素：创建
                slotsGrid.appendChild(createEmptySlot(i));
            }
            // 空→空 且已有元素：什么都不做
        }
    });

    currentSlots = slotsData;
    onlineCount.textContent = occupiedCount;
    slotsInfo.textContent = `${occupiedCount}/${MAX_SLOTS} 已占用`;

    // 同步投影模式
    if (projectionMode.classList.contains('active')) {
        syncProjection(slotsData);
    }
}

// ===== 同步投影模式（全量重建，因为投影模式不常开） =====
function syncProjection(slotsData) {
    projectionGrid.innerHTML = '';
    slotsData.forEach((slot, i) => {
        if (slot && slot.occupied) {
            const card = document.createElement('div');
            card.className = 'slot-card occupied';
            card.dataset.index = i;
            card.innerHTML = buildOccupiedHTML(slot);
            projectionGrid.appendChild(card);
        } else {
            const card = document.createElement('div');
            card.className = 'slot-card empty';
            card.dataset.index = i;
            card.innerHTML = `<span class="slot-number">卡位 ${i + 1}</span><span class="empty-icon">📱</span><span class="empty-text">等待加入</span>`;
            projectionGrid.appendChild(card);
        }
    });
}

// ===== 事件委托：处理卡位按钮点击 =====
slotsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.slot-action-btn');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index);
    const slot = currentSlots[index];
    if (!slot) return;

    if (action === 'clear') {
        if (confirm(`确定要清空卡位${index + 1}吗？\n学员"${slot.studentName}"将被移除，投屏内容将被清除。`)) {
            socket.emit('teacher_clear_slot', { slotIndex: index });
            showToast(`已清空卡位${index + 1}`, 'success');
        }
    }
});

// ===== 事件委托：双击文字/图片放大查看 =====
slotsGrid.addEventListener('dblclick', (e) => {
    const textEl = e.target.closest('.slot-text');
    const imageEl = e.target.closest('.slot-image');

    if (textEl) {
        const card = textEl.closest('.slot-card');
        const index = parseInt(card.dataset.index);
        const slot = currentSlots[index];
        if (slot && slot.content && slot.content.text) {
            openViewer(slot, 'text');
        }
    } else if (imageEl) {
        const card = imageEl.closest('.slot-card');
        const index = parseInt(card.dataset.index);
        const slot = currentSlots[index];
        if (slot && slot.content && slot.content.image) {
            openViewer(slot, 'image');
        }
    }
});

// 投影模式也支持双击
projectionGrid.addEventListener('dblclick', (e) => {
    const textEl = e.target.closest('.slot-text');
    const imageEl = e.target.closest('.slot-image');

    if (textEl) {
        const card = textEl.closest('.slot-card');
        const index = parseInt(card.dataset.index);
        const slot = currentSlots[index];
        if (slot && slot.content && slot.content.text) {
            openViewer(slot, 'text');
        }
    } else if (imageEl) {
        const card = imageEl.closest('.slot-card');
        const index = parseInt(card.dataset.index);
        const slot = currentSlots[index];
        if (slot && slot.content && slot.content.image) {
            openViewer(slot, 'image');
        }
    }
});

// ===== 打开放大查看模态框 =====
function openViewer(slot, type) {
    // 设置头部信息（学员姓名 + 卡位号）
    viewerHeader.innerHTML = `
        <span class="viewer-slot-tag">卡位 ${slot.index + 1}</span>
        <span class="viewer-name">${escapeHtml(slot.studentName)}</span>
    `;

    // 设置内容
    if (type === 'text') {
        viewerBody.innerHTML = `<div class="viewer-text">${escapeHtml(slot.content.text.text)}</div>`;
    } else if (type === 'image') {
        viewerBody.innerHTML = `<img class="viewer-image" src="${slot.content.image.url}" alt="放大图片">`;
    }

    viewerModal.classList.add('active');
}

// ===== 关闭放大查看模态框 =====
function closeViewer() {
    viewerModal.classList.remove('active');
    viewerBody.innerHTML = '';
    viewerHeader.innerHTML = '';
}

// 关闭按钮
viewerClose.addEventListener('click', closeViewer);
// 点击背景关闭
viewerBackdrop.addEventListener('click', closeViewer);
// ESC 键关闭
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewerModal.classList.contains('active')) {
        closeViewer();
    }
});

// ===== 清空所有内容 =====
document.getElementById('clearAllBtn').addEventListener('click', async () => {
    if (!confirm('确定要清空所有卡位内容吗？')) return;
    try {
        await fetch('/api/clear-content', { method: 'POST' });
        showToast('已清空所有内容', 'success');
    } catch (err) {
        showToast('清空失败', 'error');
    }
});

// ===== 全屏投影 =====
document.getElementById('fullscreenBtn').addEventListener('click', () => {
    projectionMode.classList.add('active');
    syncProjection(currentSlots);
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
});

document.getElementById('exitProjectionBtn').addEventListener('click', () => {
    projectionMode.classList.remove('active');
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
});

// ===== Toast =====
function showToast(msg, type = '') {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ===== HTML 转义 =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ===== Socket.io 事件 =====
socket.on('connect', () => {
    console.log('已连接服务器');
});

socket.on('slots_update', (slotsData) => {
    renderSlots(slotsData);
});

// ===== 初始化 =====
initSlots();
loadQRCode();
// 主动获取当前卡位状态（避免刷新后丢失已有学员）
loadCurrentSlots();

// 定期刷新二维码（更新占用状态）
setInterval(loadQRCode, 30000);

// 定期同步卡位状态（防止丢失事件）
setInterval(loadCurrentSlots, 5000);
