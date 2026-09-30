const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
// 宝塔/Nginx 反向代理会通过 X-Forwarded-* 传递公网协议和域名。
app.set('trust proxy', true);
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST", "DELETE"] }
});

const PORT = process.env.PORT || 9123;
const MAX_STUDENTS = 6; // 最多6个学员卡位

function getPublicBaseUrl(req) {
    if (process.env.PUBLIC_URL) {
        return process.env.PUBLIC_URL.trim().replace(/\/$/, '');
    }

    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    return `${protocol}://${req.get('host')}`;
}

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ===== 学员卡位管理 =====
// slots: [{ socketId, studentName, studentId, joinedAt, content: {text, image} }]
const slots = new Array(MAX_STUDENTS).fill(null);

// 获取空闲卡位索引（只有完全为 null 的卡位才是空闲的，离线卡位不释放）
function getFreeSlotIndex() {
    for (let i = 0; i < MAX_STUDENTS; i++) {
        if (slots[i] === null) return i;
    }
    return -1;
}

// 根据 socketId 查找卡位
function findSlotBySocketId(socketId) {
    for (let i = 0; i < MAX_STUDENTS; i++) {
        if (slots[i] && slots[i].socketId === socketId) return i;
    }
    return -1;
}

// 广播卡位状态给所有客户端
function broadcastSlots() {
    const slotsData = slots.map((s, i) => {
        if (s) {
            return {
                index: i,
                occupied: true,
                online: s.online !== false,
                studentName: s.studentName,
                studentId: s.studentId,
                joinedAt: s.joinedAt,
                content: s.content || null
            };
        }
        return { index: i, occupied: false };
    });
    io.emit('slots_update', slotsData);
}

// 文件上传配置
const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`;
        cb(null, filename);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
        if (allowed.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('仅支持图片格式'));
        }
    }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// 获取本机局域网IP（智能过滤虚拟网卡）
// 云服务器部署时，通过环境变量 PUBLIC_IP 设置公网IP
function getLocalIP() {
    // 优先使用环境变量配置的公网IP（云服务器部署用）
    if (process.env.PUBLIC_IP) {
        return process.env.PUBLIC_IP;
    }

    const interfaces = os.networkInterfaces();
    // 虚拟网卡关键字（这些网卡的IP不能被手机访问）
    const virtualKeywords = ['vmware', 'virtual', 'wsl', 'vethernet', 'hyper-v', 'docker', 'radmin', 'letstap', 'vpn', 'loopback'];
    // 优先级：WLAN/以太网 等物理网卡 > 其他
    const preferredKeywords = ['wlan', 'wi-fi', 'wifi', '以太网', 'ethernet', '以太网'];

    const candidates = [];

    for (const name of Object.keys(interfaces)) {
        const lowerName = name.toLowerCase();
        // 跳过虚拟网卡
        const isVirtual = virtualKeywords.some(k => lowerName.includes(k));
        for (const iface of interfaces[name]) {
            if (iface.family !== 'IPv4' || iface.internal) continue;
            // 跳过 169.254.x.x (APIPA自动配置，未连接)
            if (iface.address.startsWith('169.254.')) continue;
            // 跳过虚拟网卡的IP
            if (isVirtual) continue;

            const isPreferred = preferredKeywords.some(k => lowerName.includes(k));
            candidates.push({
                address: iface.address,
                name: name,
                preferred: isPreferred
            });
            console.log(`[网络] ${name}: ${iface.address} ${isPreferred ? '(优先)' : ''} ${isVirtual ? '(虚拟-跳过)' : ''}`);
        }
    }

    // 优先选择物理网卡（WLAN/以太网）
    const preferred = candidates.find(c => c.preferred);
    if (preferred) return preferred.address;

    // 其次选择 192.168.x.x 或 10.x.x.x 网段
    const lanIp = candidates.find(c =>
        c.address.startsWith('192.168.') || c.address.startsWith('10.')
    );
    if (lanIp) return lanIp.address;

    // 最后返回任意候选
    if (candidates.length > 0) return candidates[0].address;

    return '127.0.0.1';
}

// 图片上传接口
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未收到文件' });
    }
    const studentId = req.body.studentId || 'unknown';
    // 查找该学员的卡位
    let slotIndex = -1;
    for (let i = 0; i < MAX_STUDENTS; i++) {
        if (slots[i] && slots[i].studentId === studentId) {
            slotIndex = i;
            break;
        }
    }

    const imageData = {
        id: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename,
        uploadedAt: Date.now(),
        slotIndex: slotIndex
    };

    // 更新卡位内容
    if (slotIndex >= 0 && slots[slotIndex]) {
        slots[slotIndex].content = slots[slotIndex].content || {};
        slots[slotIndex].content.image = imageData;
        broadcastSlots();
    }

    res.json(imageData);
});

// 获取卡位状态
app.get('/api/slots', (req, res) => {
    const slotsData = slots.map((s, i) => {
        if (s) {
            return {
                index: i,
                occupied: true,
                online: s.online !== false,
                studentName: s.studentName,
                studentId: s.studentId,
                joinedAt: s.joinedAt,
                content: s.content || null
            };
        }
        return { index: i, occupied: false };
    });
    res.json({ maxStudents: MAX_STUDENTS, slots: slotsData });
});

// 获取二维码
app.get('/api/qrcode', async (req, res) => {
    const studentUrl = `${getPublicBaseUrl(req)}/student.html`;
    const occupiedCount = slots.filter(s => s !== null).length;
    try {
        const qr = await QRCode.toDataURL(studentUrl, {
            width: 480,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        });
        res.json({
            qr,
            url: studentUrl,
            ip: getLocalIP(),
            port: PORT,
            maxStudents: MAX_STUDENTS,
            occupiedCount,
            available: occupiedCount < MAX_STUDENTS
        });
    } catch (err) {
        res.status(500).json({ error: '二维码生成失败' });
    }
});

// 清空所有卡位内容（教师端操作，不踢人）
app.post('/api/clear-content', (req, res) => {
    slots.forEach(s => {
        if (s) s.content = null;
    });
    // 清空上传目录
    fs.readdir(uploadsDir, (err, files) => {
        if (!err) {
            files.forEach(f => {
                if (!f.startsWith('.')) {
                    fs.unlinkSync(path.join(uploadsDir, f));
                }
            });
        }
    });
    broadcastSlots();
    res.json({ success: true });
});

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log(`[连接] ${socket.id}`);

    // 学员加入
    socket.on('student_join', (data) => {
        const freeIndex = getFreeSlotIndex();
        if (freeIndex === -1) {
            // 已满员
            socket.emit('join_rejected', { reason: '已满员，请稍后再试' });
            return;
        }
        const studentId = data.studentId || socket.id;
        slots[freeIndex] = {
            socketId: socket.id,
            studentName: data.studentName || '匿名同学',
            studentId: studentId,
            joinedAt: Date.now(),
            content: null,
            online: true
        };
        socket.emit('join_accepted', { slotIndex: freeIndex, maxStudents: MAX_STUDENTS });
        broadcastSlots();
        console.log(`[学员加入] ${data.studentName || '匿名'} -> 卡位 ${freeIndex + 1}`);
    });

    // 学员发送文字内容
    socket.on('submit_text', (data) => {
        const slotIndex = findSlotBySocketId(socket.id);
        if (slotIndex === -1) return;
        slots[slotIndex].content = slots[slotIndex].content || {};
        slots[slotIndex].content.text = {
            text: data.text,
            timestamp: Date.now()
        };
        broadcastSlots();
        console.log(`[文字] 卡位${slotIndex + 1}: ${data.text.substring(0, 30)}`);
    });

    // 学员清空自己的内容
    socket.on('clear_my_content', () => {
        const slotIndex = findSlotBySocketId(socket.id);
        if (slotIndex === -1) return;
        slots[slotIndex].content = null;
        broadcastSlots();
    });

    // 教师清空某个卡位（清空内容 + 移除学员，无论在线/离线）
    socket.on('teacher_clear_slot', (data) => {
        const idx = data.slotIndex;
        if (idx >= 0 && idx < MAX_STUDENTS && slots[idx]) {
            // 如果学员在线，通知并断开
            const targetSocket = io.sockets.sockets.get(slots[idx].socketId);
            if (targetSocket) {
                targetSocket.emit('kicked_by_teacher');
                targetSocket.disconnect(true);
            }
            // 清空卡位（内容 + 学员全部移除）
            slots[idx] = null;
            broadcastSlots();
            console.log(`[清空卡位] 卡位 ${idx + 1} 内容和学员已清空`);
        }
    });

    // 教师踢出某个学员（真正清空卡位）
    socket.on('teacher_kick_slot', (data) => {
        const idx = data.slotIndex;
        if (idx >= 0 && idx < MAX_STUDENTS && slots[idx]) {
            const targetSocket = io.sockets.sockets.get(slots[idx].socketId);
            if (targetSocket) {
                targetSocket.emit('kicked_by_teacher');
                targetSocket.disconnect(true);
            }
            slots[idx] = null;
            broadcastSlots();
        }
    });

    // 教师手动释放卡位（清空离线学员的卡位）
    socket.on('teacher_release_slot', (data) => {
        const idx = data.slotIndex;
        if (idx >= 0 && idx < MAX_STUDENTS && slots[idx]) {
            slots[idx] = null;
            broadcastSlots();
            console.log(`[释放卡位] 卡位 ${idx + 1} 已清空`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[断开] ${socket.id}`);
        const slotIndex = findSlotBySocketId(socket.id);
        if (slotIndex !== -1) {
            // 保留卡位内容和学员信息，只标记为离线
            slots[slotIndex].online = false;
            slots[slotIndex].socketId = null;
            broadcastSlots();
            console.log(`[学员离线] 卡位 ${slotIndex + 1} 内容已保留`);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('═══════════════════════════════════════');
    console.log('  课堂投屏互动系统 已启动');
    console.log('═══════════════════════════════════════');
    console.log(`  教师端(投影):  http://${ip}:${PORT}`);
    console.log(`  学生端(手机):  http://${ip}:${PORT}/student.html`);
    console.log(`  最大学员数:    ${MAX_STUDENTS} 人`);
    console.log('═══════════════════════════════════════');
    console.log('  请确保手机和电脑在同一WiFi网络下');
    console.log('  按 Ctrl+C 停止服务器');
    console.log('═══════════════════════════════════════');
});
