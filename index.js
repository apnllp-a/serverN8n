const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. ตั้งค่า Middleware
app.use(cors({
  origin: ['https://helpdesk-frontend-amber.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB (it_fixit)'))
  .catch(err => console.error('❌ Connection Error:', err));


// ==========================================
// 3. ออกแบบ Schemas (ให้ตรงกับตารางจริงเป๊ะๆ)
// ==========================================

// 📦 1. คลังอุปกรณ์ (inventory_master)
const InventorySchema = new mongoose.Schema({
  itemName: String,
  category: String,
  stock: Number,
  unit: String,
  minStock: Number,
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'inventory_master' });
const Inventory = mongoose.model('Inventory', InventorySchema);

// 🎫 2. ระบบตั๋วแจ้งซ่อม/เบิกของ (tickets) -> *ตารางใหม่ที่พี่ให้มา*
const TicketSchema = new mongoose.Schema({
  ticketNo: String,
  category: String,
  priority: String,
  title: String,
  description: String,
  reporterId: String,  // จะตรงกับ lineUserId
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'tickets' });
const Ticket = mongoose.model('Ticket', TicketSchema);

// 👥 3. ข้อมูลผู้ใช้งาน (users) -> *ตารางใหม่ที่พี่ให้มา*
const UserSchema = new mongoose.Schema({
  lineUserId: String,
  displayName: String,
  firstName: String,
  lastName: String,
  department: String,
  role: String,
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'users' });
const User = mongoose.model('User', UserSchema);

// 📝 4. บันทึกการทำงาน (logs) -> *ตารางใหม่ที่พี่ให้มา*
const LogSchema = new mongoose.Schema({
  action: String,
  description: String,
  targetId: String,
  performedBy: String,
  timestamp: { type: Date, default: Date.now }
}, { collection: 'logs' });
const Log = mongoose.model('Log', LogSchema);

// ⚙️ 5. ตั้งค่าระบบ (settings) -> *ตารางใหม่ที่พี่ให้มา*
const SettingSchema = new mongoose.Schema({
  systemName: String,
  serviceStartTime: String,
  serviceEndTime: String,
  slaLimitMin: Number,
  autoReplyOffDuty: String,
  updatedBy: String
}, { collection: 'settings' });
const Setting = mongoose.model('Setting', SettingSchema);

// (ถ้าพี่ยังใช้ repairs กับ requisitions อยู่ ผมคงไว้ให้นะครับ เผื่อ Dashboard เก่ายังเรียกใช้)
const Requisition = mongoose.model('Requisition', new mongoose.Schema({
  userId: String, senderName: String, itemName: String, quantity: Number,
  status: String, requested_at: Date, approved_at: Date, action_by: String
}, { collection: 'requisitions' }));

const Repair = mongoose.model('Repair', new mongoose.Schema({
  userId: String, senderName: String, problem_details: String,
  status: String, reported_at: Date, completed_at: Date, action_by: String
}, { collection: 'repairs' }));


// ==========================================
// 4. API Routes (สำหรับให้ Dashboard ดึงข้อมูล)
// ==========================================

// 📦 API: ดึงสต๊อกทั้งหมด
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ itemName: 1 });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🎫 API: ดึงรายการตั๋วทั้งหมด (Tickets)
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 👥 API: ดึงข้อมูล Users ทั้งหมด
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📝 API: ดึงข้อมูล Logs
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await Log.find().sort({ timestamp: -1 }).limit(100); // ดึงล่าสุด 100 รายการ
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ⚙️ API: ดึงการตั้งค่าระบบ (Settings)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Setting.findOne(); // ดึงก้อนแรกมาใช้
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 API: อนุมัติการเบิก และ ตัดสต๊อก (อิงจาก Requisitions เดิม)
app.put('/api/requisitions/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action_by } = req.body;

    const reqDoc = await Requisition.findById(id);
    if (!reqDoc) return res.status(404).json({ success: false, message: 'ไม่พบรายการเบิก' });
    if (reqDoc.status === 'Approved') return res.status(400).json({ success: false, message: 'อนุมัติไปแล้ว' });

    const deductAmount = Number(reqDoc.quantity) || 0;

    const inventoryUpdate = await Inventory.findOneAndUpdate(
      { itemName: reqDoc.itemName },
      { $inc: { stock: -deductAmount }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    if (!inventoryUpdate) return res.status(404).json({ success: false, message: 'ไม่พบสินค้าในคลัง' });

    reqDoc.status = 'Approved';
    reqDoc.approved_at = new Date();
    reqDoc.action_by = action_by || 'Admin';
    await reqDoc.save();

    res.json({ success: true, message: 'ตัดสต๊อกเรียบร้อย', current_stock: inventoryUpdate.stock });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// API ของเดิม (Repairs & Requisitions)
app.get('/api/repairs', async (req, res) => {
  try { const jobs = await Repair.find().sort({ reported_at: -1 }); res.json(jobs); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requisitions', async (req, res) => {
  try { const items = await Requisition.find().sort({ requested_at: -1 }); res.json(items); }
  catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/', (req, res) => res.send('🚀 Helpdesk API with All Modules is running...'));

// 5. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));