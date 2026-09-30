// ===== 学生端逻辑 =====

const socket = io();
let studentId = localStorage.getItem('studentId') || generateId();
let studentName = '';
let mySlotIndex = -1;
let joined = false;
let selectedImage = null;
let loginInProgress = false;

localStorage.setItem('studentId', studentId);

// ===== DOM 引用 =====
// 登录界面
const loginScreen = document.getElementById('loginScreen');
const loginNameInput = document.getElementById('loginNameInput');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
// 满员提示
const fullNotice = document.getElementById('fullNotice');
// 主界面
const mainContent = document.getElementById('mainContent');
const statusIndicator = document.getElementById('statusIndicator');
const userNameDisplay = document.getElementById('userNameDisplay');
const userSlotDisplay = document.getElementById('userSlotDisplay');
const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const imageArea = document.getElementById('imageArea');
const imagePlaceholder = document.getElementById('imagePlaceholder');
const imagePreview = document.getElementById('imagePreview');
const imageInput = document.getElementById('imageInput');
const imageRemoveBtn = document.getElementById('imageRemoveBtn');
const cameraBtn = document.getElementById('cameraBtn');
const albumBtn = document.getElementById('albumBtn');
const sendBtn = document.getElementById('sendBtn');
const clearMyBtn = document.getElementById('clearMyBtn');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const toast = document.getElementById('toast');

// ===== 工具函数 =====
function generateId() {
    return 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

function showToast(msg, type = '') {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function updateStatus(status, text) {
    const dot = statusIndicator.querySelector('.status-dot');
    const textEl = statusIndicator.querySelector('.status-text');
    dot.className = `status-dot ${status}`;
    textEl.textContent = text;
}

function setLoginStatus(msg, type = '') {
    loginStatus.textContent = msg;
    loginStatus.className = `login-status ${type}`;
}

// ===== 登录逻辑 =====
// 恢复上次姓名
const savedName = localStorage.getItem('studentName');
if (savedName) loginNameInput.value = savedName;

// 更新登录按钮状态
function updateLoginBtn() {
    loginBtn.disabled = loginNameInput.value.trim().length === 0;
}

loginNameInput.addEventListener('input', () => {
    updateLoginBtn();
    setLoginStatus('');
});

loginNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !loginBtn.disabled) {
        doLogin();
    }
});

// 执行登录
function doLogin() {
    const name = loginNameInput.value.trim();
    if (!name) {
        setLoginStatus('请输入姓名');
        return;
    }
    if (loginInProgress) return;
    loginInProgress = true;

    studentName = name;
    localStorage.setItem('studentName', name);
    loginBtn.disabled = true;
    loginBtn.querySelector('span:first-child').textContent = '正在进入...';

    if (socket.connected) {
        socket.emit('student_join', { studentName: name, studentId });
    } else {
        setLoginStatus('正在连接服务器...', 'info');
        // 等待连接后自动加入
    }
}

loginBtn.addEventListener('click', doLogin);

// ===== 发送按钮状态 =====
function updateSendBtn() {
    const hasText = textInput.value.trim().length > 0;
    const hasImage = selectedImage !== null;
    sendBtn.disabled = (!hasText && !hasImage) || !joined;
}

// ===== 文字输入 =====
textInput.addEventListener('input', () => {
    charCount.textContent = textInput.value.length;
    updateSendBtn();
});

// ===== 图片选择 =====
cameraBtn.addEventListener('click', () => {
    imageInput.setAttribute('capture', 'environment');
    imageInput.click();
});

albumBtn.addEventListener('click', () => {
    imageInput.removeAttribute('capture');
    imageInput.click();
});

imageArea.addEventListener('click', () => {
    imageInput.removeAttribute('capture');
    imageInput.click();
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        showToast('图片不能超过20MB', 'error');
        return;
    }
    selectedImage = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
        imagePreview.src = ev.target.result;
        imagePreview.style.display = 'block';
        imagePlaceholder.style.display = 'none';
        imageRemoveBtn.style.display = 'flex';
        imageArea.classList.add('has-image');
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
    updateSendBtn();
});

// ===== 移除图片 =====
imageRemoveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedImage = null;
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    imagePlaceholder.style.display = 'block';
    imageRemoveBtn.style.display = 'none';
    imageArea.classList.remove('has-image');
    updateSendBtn();
});

// ===== 发送投屏 =====
sendBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text && !selectedImage) return;
    if (!joined) {
        showToast('正在加入中，请稍候', 'error');
        return;
    }

    sendBtn.disabled = true;

    // 先发送文字
    if (text) {
        socket.emit('submit_text', { text });
    }

    // 再上传图片
    if (selectedImage) {
        uploadProgress.style.display = 'block';
        progressFill.style.width = '30%';
        progressText.textContent = '正在发送图片...';

        try {
            const formData = new FormData();
            formData.append('file', selectedImage);
            formData.append('studentName', studentName);
            formData.append('studentId', studentId);

            progressFill.style.width = '60%';
            const res = await fetch('/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('上传失败');

            progressFill.style.width = '100%';
            progressText.textContent = '发送成功！';

            setTimeout(() => {
                uploadProgress.style.display = 'none';
                progressFill.style.width = '0%';
            }, 1000);
        } catch (err) {
            showToast('图片发送失败', 'error');
            uploadProgress.style.display = 'none';
            progressFill.style.width = '0%';
        }
    }

    // 清空输入
    textInput.value = '';
    charCount.textContent = '0';
    selectedImage = null;
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    imagePlaceholder.style.display = 'block';
    imageRemoveBtn.style.display = 'none';
    imageArea.classList.remove('has-image');

    showToast('投屏内容已发送', 'success');
    updateSendBtn();
});

// ===== 清空我的内容 =====
clearMyBtn.addEventListener('click', () => {
    if (!joined) return;
    if (!confirm('确定要清空你的投屏内容吗？')) return;
    socket.emit('clear_my_content');
    showToast('已清空投屏内容', 'success');
});

// ===== Socket.io 事件 =====
socket.on('connect', () => {
    // 如果用户已输入姓名正在等待连接，现在发起加入
    if (loginInProgress && studentName && !joined) {
        setLoginStatus('正在进入课堂...', 'info');
        socket.emit('student_join', { studentName, studentId });
    }
});

socket.on('disconnect', () => {
    if (joined) {
        updateStatus('disconnected', '已断开');
    }
    joined = false;
});

socket.on('join_accepted', (data) => {
    joined = true;
    loginInProgress = false;
    mySlotIndex = data.slotIndex;

    // 切换到主界面
    loginScreen.style.display = 'none';
    fullNotice.style.display = 'none';
    mainContent.style.display = 'block';

    // 显示用户信息
    userNameDisplay.textContent = studentName;
    userSlotDisplay.textContent = `卡位 ${mySlotIndex + 1}`;
    updateStatus('connected', '已连接');

    // 恢复登录按钮
    loginBtn.disabled = false;
    loginBtn.querySelector('span:first-child').textContent = '进入课堂';

    updateSendBtn();
    showToast(`欢迎 ${studentName}，你是卡位 ${mySlotIndex + 1}`, 'success');
});

socket.on('join_rejected', (data) => {
    joined = false;
    loginInProgress = false;

    // 恢复登录按钮
    loginBtn.disabled = false;
    loginBtn.querySelector('span:first-child').textContent = '进入课堂';

    // 显示满员提示
    loginScreen.style.display = 'none';
    fullNotice.style.display = 'flex';

    showToast(data.reason || '已满员', 'error');
});

socket.on('kicked_by_teacher', () => {
    joined = false;
    mainContent.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginNameInput.value = studentName;
    updateLoginBtn();
    setLoginStatus('你已被老师移除，请重新进入', 'info');
    showToast('你已被老师移除', 'error');
});

// ===== 初始化 =====
updateLoginBtn();
updateSendBtn();
// 自动聚焦到姓名输入框
loginNameInput.focus();
