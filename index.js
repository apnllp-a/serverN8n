const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. ตั้งค่า Middleware (ปรับให้รองรับรูปภาพขนาดใหญ่)
app.use(cors({
  origin: 'https://helpdesk-frontend-amber.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // รองรับรูป Base64
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB (it_fixit)'))
  .catch(err => console.error('❌ Connection Error:', err));

// --- 3. ออกแบบ Schemas ---

// ขอบเขตงานซ่อม
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

// 1. คลังอุปกรณ์
const InventorySchema = new mongoose.Schema({
  item_name: String,
  category: String,
  stock: Number,
  unit: String, // เช่น อัน, กล่อง, ตัว
  updated_at: { type: Date, default: Date.now }
});

// 2. รายการคำขอเบิก
const RequisitionSchema = new mongoose.Schema({
  userId: String,
  senderName: String,
  item_id: mongoose.Schema.Types.ObjectId, // เชื่อมกับ ID ของในคลัง
  item_name: String,
  request_qty: Number,
  status: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
  requested_at: { type: Date, default: Date.now },
  approved_at: Date,
  action_by: String
});

const Inventory = mongoose.model('Inventory', InventorySchema);
const Requisition = mongoose.model('Requisition', RequisitionSchema);

// --- 4. API Routes (Repairs) ---

app.get('/', (req, res) => res.send('Repair API is Ready!'));

app.post('/api/repairs', async (req, res) => {
  try {
    const newJob = new Repair(req.body);
    await newJob.save();
    res.status(201).json({ success: true, id: newJob._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/repairs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await Repair.findByIdAndUpdate(
      id,
      { status: status || 'In Progress', accepted_at: new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/repairs', async (req, res) => {
  const allJobs = await Repair.find().sort({ reported_at: -1 });
  res.json(allJobs);
});

// --- 5. API Routes (Inventory - CRUD) ---

app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ updated_at: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const newItem = new Inventory(req.body);
    await newItem.save();
    res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inventory/:id', async (req, res) => {
  try {
    const updated = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// อัปเดต Ticket แบบละเอียด (จากหน้า Dashboard)
app.put('/api/repairs/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    let updateData = {
      status: status,
      action_by: 'Admin'
    };

    if (status === 'In Progress') updateData.accepted_at = new Date();
    if (status === 'Resolved') updateData.completed_at = new Date();

    const updated = await Repair.findByIdAndUpdate(id, updateData, { new: true });

    if (!updated) return res.status(404).json({ success: false });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 5.1 API Route สำหรับ "อนุมัติการเบิกและตัดสต๊อก" ---

app.put('/api/requisitions/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. ค้นหาใบคำขอเบิกก่อน
    const reqDoc = await Requisition.findById(id);
    if (!reqDoc) return res.status(404).json({ success: false, message: 'Requisition not found' });
    if (reqDoc.status === 'Approved') return res.status(400).json({ success: false, message: 'Already approved' });

    // 2. อัปเดตสถานะใบเบิกเป็น Approved
    reqDoc.status = 'Approved';
    reqDoc.approved_at = new Date();
    await reqDoc.save();

    // 3. ตัดสต๊อกใน Inventory (ใช้ $inc เพื่อความแม่นยำ)
    const inventoryUpdate = await Inventory.findOneAndUpdate(
      { item_name: reqDoc.item_name },
      { $inc: { stock: -(Number(reqDoc.request_qty) || 1) } },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Approved and Stock Updated',
      data: reqDoc,
      remaining_stock: inventoryUpdate ? inventoryUpdate.stock_qty : 'N/A'
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. รัน Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


