const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. ตั้งค่า Middleware
app.use(cors({
  origin: ['https://helpdesk-frontend-amber.vercel.app', 'http://localhost:5173'], // เพิ่ม localhost ไว้เผื่อพี่รันเทส
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB (it_fixit)'))
  .catch(err => console.error('❌ Connection Error:', err));

// --- 3. ออกแบบ Schemas ---

// งานแจ้งซ่อม
const RepairSchema = new mongoose.Schema({
  userId: String,
  senderName: String,
  problem_details: String,
  status: { type: String, default: 'Pending' },
  reported_at: { type: Date, default: Date.now },
  accepted_at: Date,
  completed_at: Date,
  action_by: { type: String, default: 'Admin' }
});
const Repair = mongoose.model('Repair', RepairSchema);

// คลังอุปกรณ์ (Inventory)
const InventorySchema = new mongoose.Schema({
  name: String,      // ใช้ name ตามรูป DB
  item_name: String, // เก็บไว้เผื่อเรียกใช้
  category: String,
  stock: Number,     // ใช้ stock ตามรูป DB
  unit: String,
  updated_at: { type: Date, default: Date.now }
});
const Inventory = mongoose.model('Inventory', InventorySchema);

// รายการคำขอเบิก (Requisition)
const RequisitionSchema = new mongoose.Schema({
  userId: String,
  senderName: String,
  item_id: mongoose.Schema.Types.ObjectId,
  item_name: String,
  quantity: Number,  // ใช้ quantity ตามรูป DB
  status: { type: String, default: 'Pending' },
  requested_at: { type: Date, default: Date.now },
  approved_at: Date,
  action_by: String
});
const Requisition = mongoose.model('Requisition', RequisitionSchema);

// --- 4. API Routes (Repairs) ---

app.get('/api/repairs', async (req, res) => {
  try {
    const allJobs = await Repair.find().sort({ reported_at: -1 });
    res.json(allJobs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/repairs', async (req, res) => {
  try {
    const newJob = new Repair(req.body);
    await newJob.save();
    res.status(201).json({ success: true, id: newJob._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/repairs/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    let updateData = { status, action_by: 'Admin' };
    if (status === 'In Progress') updateData.accepted_at = new Date();
    if (status === 'Resolved') updateData.completed_at = new Date();
    const updated = await Repair.findByIdAndUpdate(id, updateData, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- 5. API Routes (Inventory & Requisition) ---

app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ updated_at: -1 });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requisitions', async (req, res) => {
  try {
    const items = await Requisition.find().sort({ requested_at: -1 });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 หัวใจสำคัญ: อนุมัติและตัดสต๊อก
app.put('/api/requisitions/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action_by } = req.body;

    // 1. หาใบเบิก
    const reqDoc = await Requisition.findById(id);
    if (!reqDoc) return res.status(404).json({ success: false, message: 'ไม่พบรายการเบิก' });
    if (reqDoc.status === 'Approved') return res.status(400).json({ success: false, message: 'รายการนี้อนุมัติไปแล้ว' });

    // 2. คำนวณจำนวนที่จะตัด (ป้องกัน NaN)
    const deductAmount = Number(reqDoc.quantity) || 0;

    // 3. อัปเดตสต๊อกในคลัง (หาด้วย name หรือ item_name)
    const inventoryUpdate = await Inventory.findOneAndUpdate(
      { $or: [{ name: reqDoc.item_name }, { item_name: reqDoc.item_name }] },
      { $inc: { stock: -deductAmount } },
      { new: true }
    );

    if (!inventoryUpdate) {
      console.log("⚠️ Inventory not found for name:", reqDoc.item_name);
    }

    // 4. อัปเดตสถานะใบเบิก
    reqDoc.status = 'Approved';
    reqDoc.approved_at = new Date();
    reqDoc.action_by = action_by || 'Admin';
    await reqDoc.save();

    res.json({
      success: true,
      message: 'อนุมัติและตัดสต๊อกเรียบร้อย',
      remaining_stock: inventoryUpdate ? inventoryUpdate.stock : 'Unknown'
    });

  } catch (err) {
    console.error("Error in Approval:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/', (req, res) => res.send('Helpdesk API is running...'));

// 6. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));