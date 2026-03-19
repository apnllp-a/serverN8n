const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // เพิ่มตัวนี้เพื่อคุยกับ LINE
require('dotenv').config();

const app = express();

// 1. ตั้งค่า Middleware
app.use(cors({
  origin: ['https://helpdesk-frontend-amber.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// 2. เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB (it_fixit)'))
  .catch(err => console.error('❌ Connection Error:', err));

// ==========================================
// 3. Schemas (อ้างอิงตามโครงสร้างเดิมของพี่)
// ==========================================

const User = mongoose.model('User', new mongoose.Schema({
  lineUserId: { type: String, unique: true },
  displayName: String,
  pictureUrl: String, // เพิ่มเก็บรูปโปรไฟล์
  role: { type: String, default: 'user' }, // 'admin' หรือ 'user'
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'users' }));

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
  ticketNo: String,
  category: String,
  title: String,
  description: String,
  reporterId: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'tickets' }));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
  itemName: String,
  stock: Number,
  unit: String
}, { collection: 'inventory_master' }));

// ==========================================
// 4. AUTH LOGIC (หัวใจสำคัญของ LINE Login)
// ==========================================

app.post('/api/auth/line', async (req, res) => {
  const { code } = req.body;

  try {
    // A. แลก Code เป็น Access Token จาก LINE
    const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${process.env.FRONTEND_URL}/callback`, // ต้องตรงกับใน Console
        client_id: process.env.LINE_CHANNEL_ID,
        client_secret: process.env.LINE_CHANNEL_SECRET,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenResponse.data;

    // B. เอา Access Token ไปดึง Profile ของ User
    const profileResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const lineProfile = profileResponse.data; // { userId, displayName, pictureUrl }

    // C. ตรวจสอบในฐานข้อมูลว่า User นี้มีสิทธิ์อะไร
    let user = await User.findOne({ lineUserId: lineProfile.userId });

    // ถ้าไม่มี User นี้ในระบบ (สมัครใหม่)
    if (!user) {
      user = new User({
        lineUserId: lineProfile.userId,
        displayName: lineProfile.displayName,
        pictureUrl: lineProfile.pictureUrl,
        role: 'user' // ค่าเริ่มต้นเป็น user ปกติ
      });
      await user.save();
    }

    // D. ส่งข้อมูลกลับไปให้ Frontend (ในที่นี้เราส่ง role ไปเช็คด้วย)
    res.json({
      success: true,
      token: access_token, // หรือจะทำ JWT ของตัวเองก็ได้ครับ
      role: user.role,
      user: {
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        lineUserId: user.lineUserId
      }
    });

  } catch (err) {
    console.error('LINE Auth Error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'การยืนยันตัวตนล้มเหลว' });
  }
});

// ==========================================
// 5. API Routes สำหรับ Dashboard
// ==========================================

// ดึงตั๋ว (Tickets)
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ดึงข้อมูล User (เอาไว้จัดการสิทธิ์ Admin)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// อัปเดตสิทธิ์ User (เช่น เปลี่ยนจาก user เป็น admin)
app.put('/api/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const updatedUser = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json({ success: true, data: updatedUser });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ดึงสต๊อก
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ itemName: 1 });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Health Check
app.get('/', (req, res) => res.send('🚀 Helpdesk API (Railway) with LINE Login is running...'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));