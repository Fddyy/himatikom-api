const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs-extra");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require('dotenv').config();
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors({
    origin: "https://himatikom-unipol.vercel.app",
    credentials: true
}));
app.use(express.static("public"));

// Konfigurasi Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Konfigurasi penyimpanan Cloudinary
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "blogs", // Folder di Cloudinary
        format: async (req, file) => "png", // Format file
        public_id: (req, file) => `${Date.now()}-${file.originalname.split(".")[0]}` // Nama file unik
    }
});

const upload = multer({ storage });

// File JSON
const BLOGS_FILE = "./data/blogs.json";
const USERS_FILE = "./data/users.json";

const readJSON = async (file) => {
    try {
        return await fs.readJson(file);
    } catch (err) {
        console.error("Gagal membaca file:", file, "Error:", err);
        return [];
    }
};

const writeJSON = async (file, data) => {
    try {
        await fs.writeJson(file, data, { spaces: 2 });
    } catch (err) {
        console.error("Gagal menulis file:", file, "Error:", err);
    }
};

// (async () => {
//     const name = process.env.NAME
//     const pw = process.env.PW
//     const users = await readJSON(USERS_FILE);
//     if (!users.some(u => u.username === name)) {
//         const hashedPassword = await bcrypt.hash(pw, 10);
//         users.push({ id: 1, username: name, password: hashedPassword, role: "admin", created_at: new Date().toISOString() });
//         await writeJSON(USERS_FILE, users);
//     }
// })();

const authenticate = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Token tidak ditemukan" });

    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch {
        console.error("Token verification error:", err);
        res.status(403).json({ error: "Token tidak valid" });
    }
};

// Login User
app.post("/users/login", async (req, res) => {
    const { username, password } = req.body;
    const users = await readJSON(USERS_FILE);
    const user = users.find(u => u.username === username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Username atau password salah" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: "1h" });

    res.cookie("token", token, {
        httpOnly: true, 
        secure: true,
        sameSite: "None", 
        maxAge: 60 * 60 * 1000
    });

    res.json({ message: "Login berhasil" });
});

app.get("/check-auth", (req, res) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ loggedIn: false, error: "Token tidak ditemukan" });
    }

    try {
        const user = jwt.verify(token, SECRET_KEY);
        res.json({ loggedIn: true, user });
    } catch (err) {
        res.status(403).json({ loggedIn: false, error: "Token tidak valid" });
    }
});


app.get("/blogs", async (req, res) => {
    const blogs = await readJSON(BLOGS_FILE);
    res.json(blogs.map(({ id, title, author, created_at, image_url }) => ({ id, title, author, created_at, image_url })));
});

// Mendapatkan blog terbaru
app.get("/home/blogs", async (req, res) => {
    const blogs = await readJSON(BLOGS_FILE);
    const sortedBlogs = blogs
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3);
    
    res.json(sortedBlogs.map(({ id, title, author, created_at, image_url }) => ({ id, title, author, created_at, image_url })));
});


app.get("/blog/:id", async (req, res) => {
    const blogs = await readJSON(BLOGS_FILE);
    const blog = blogs.find(b => b.id === parseInt(req.params.id));
    if (!blog) return res.status(404).json({ error: "Blog tidak ditemukan" });
    res.json(blog);
});

// Menambahkan blog baru dengan upload ke Cloudinary
app.post("/add/blog", authenticate, upload.single("image"), async (req, res) => {
    
    try {
        const { title, content, author } = req.body;
        if (!title || !content || !author) return res.status(400).json({ error: "Semua field harus diisi" });
    
        const blogs = await readJSON(BLOGS_FILE);
        const newBlog = {
            id: blogs.length > 0 ? Math.max(...blogs.map(b => b.id)) + 1 : 1,
            title,
            content,
            author,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            image_url: req.file ? req.file.path : null, // URL gambar Cloudinary
            image_public_id: req.file ? req.file.filename.split("/").pop().split(".")[0] : null // ID gambar di Cloudinary
        };
    
        blogs.push(newBlog);
        await writeJSON(BLOGS_FILE, blogs);
        res.status(201).json(newBlog);
    } catch (err) {
        console.error("Error saat menambahkan blog:", err); // Log error lebih rinci
        res.status(500).json({ error: "Terjadi kesalahan server" });
    }
});


app.delete("/blog/:id", authenticate, async (req, res) => {
    let blogs = await readJSON(BLOGS_FILE);
    const blogIndex = blogs.findIndex(b => b.id === parseInt(req.params.id));

    if (blogIndex === -1) {
        return res.status(404).json({ error: "Blog tidak ditemukan" });
    }

    const blog = blogs[blogIndex];

    // Hapus blog dari daftar
    blogs.splice(blogIndex, 1);
    await writeJSON(BLOGS_FILE, blogs);


    if (blog.image_public_id) {
        try {
            await cloudinary.uploader.destroy(blog.image_public_id);
        } catch (err) {
            console.error("Gagal menghapus gambar dari Cloudinary:", err);
        }
    }

    res.json({ message: "Blog dan gambar berhasil dihapus" });
});

app.listen(PORT, () => console.log(`Server berjalan..`));
