const express = require("express");
const bodyParser = require("body-parser");
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
const JSONBIN_ID = process.env.JSONBIN_ID;
const MASTER_KEY = process.env.MASTER_KEY;
const ACCESS_KEY = process.env.ACCESS_KEY;

// SLUG
const slugify = (title) => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')  // Hapus karakter selain huruf, angka, spasi dan tanda hubung
        .replace(/\s+/g, '-')          // Ganti spasi dengan tanda hubung
        .trim();
};

// Fungsi membaca data dari JSONBin.io
const fetchData = async () => {
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
            headers: {
                "X-Access-Key": ACCESS_KEY,
            },
        });

        const result = await response.json();
        return result.record || {};

    } catch (err) {
        console.error("Gagal mengambil data dari JSONBin:", err);
    return {};
    }
};

// Fungsi menulis data ke JSONBin.io
const saveData = async (data) => {
    try {
        await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": MASTER_KEY,
            },
            body: JSON.stringify(data),
        });
    } catch (err) {
        console.error("Gagal menyimpan data ke JSONBin:", err);
    }
};

// (async () => {
//     const name = process.env.USER_ADMIN
//     const pw = process.env.PW
//     const data = await fetchData();
//     const users = data.users || [];
//     if (!users.some(u => u.username === name)) {
//         const hashedPassword = await bcrypt.hash(pw, 10);
//         users.push({ id: 1, username: name, password: hashedPassword, role: "admin", created_at: new Date().toISOString() });
//         data.users = users;
//         await saveData(data)
//     }
// })();

const authenticate = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Token tidak ditemukan" });

    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch (err) {
        console.error("Token verification error:", err);
        res.status(403).json({ error: "Token tidak valid" });
    }
};

// Login User
app.post("/users/login", async (req, res) => {
    const { username, password } = req.body;
    const data = await fetchData();
    const users = data.users || [];
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
    const data = await fetchData();
    const blogs = data.blogs || [];
    res.json(blogs.map(({title, slug,author, created_at, image_url }) => ({ title, slug,author, created_at, image_url })));
});

// Mendapatkan blog terbaru
app.get("/home/blogs", async (req, res) => {
    const data = await fetchData();
    const blogs = data.blogs || [];
    const sortedBlogs = blogs
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3);
    
    res.json(sortedBlogs.map(({title, slug,author, created_at, image_url }) => ({ title, slug,author, created_at, image_url })));
});


app.get("/blog/:slug", async (req, res) => {
    const data = await fetchData();
    const blogs = data.blogs || [];
    const blog = blogs.find(b => b.slug === req.params.slug);
    if (!blog) return res.status(404).json({ error: "Blog tidak ditemukan" });
    res.json(blog);
});

// Menambahkan blog baru dengan upload ke Cloudinary
app.post("/add/blog", authenticate, upload.single("image"), async (req, res) => {
    
    try {
        const { title, content, author } = req.body;
        if (!title || !content || !author) return res.status(400).json({ error: "Semua field harus diisi" });
    
        const data = await fetchData();
        const blogs = data.blogs || [];

        const newBlog = {
            id: blogs.length > 0 ? Math.max(...blogs.map(b => b.id)) + 1 : 1,
            title,
            slug: slugify(title),
            content,
            author,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            image_url: req.file ? req.file.path : null, // URL gambar Cloudinary
            image_public_id: req.file ? req.file.filename.split("/").pop().split(".")[0] : null // ID gambar di Cloudinary
        };
    
        blogs.push(newBlog);
        data.blogs = blogs;
        await saveData(data);
        res.status(201).json(newBlog);
    } catch (err) {
        console.error("Error saat menambahkan blog:", err); // Log error lebih rinci
        res.status(500).json({ error: "Terjadi kesalahan server" });
    }
});


app.delete("/blog/:id", authenticate, async (req, res) => {
    const data = await fetchData();
    let blogs = data.blogs || [];
    const blogIndex = blogs.findIndex(b => b.id === parseInt(req.params.id));

    if (blogIndex === -1) {
        return res.status(404).json({ error: "Blog tidak ditemukan" });
    }

    const blog = blogs[blogIndex];

    // Hapus blog dari daftar
    blogs.splice(blogIndex, 1);

    data.blogs = blogs;
    await saveData(data);


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
