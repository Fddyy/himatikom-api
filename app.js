const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs-extra");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mime = require("mime-types");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors({
    origin: "https://himatikom-unipol-gjryk3uwo-feddy-projects.vercel.app",
    credentials: true
}));
app.use(express.static("public"));


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    const ext = mime.extension(file.mimetype);
    const filename = `${Date.now()}.${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

// File JSON
const BLOGS_FILE = "./data/blogs.json";
const USERS_FILE = "./data/users.json";


const readJSON = async (file) => {
    try {
        return await fs.readJson(file);
    } catch (err) {
        return [];
    }
};


const writeJSON = async (file, data) => {
    await fs.writeJson(file, data, { spaces: 2 });
};


const authenticate = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Token tidak ditemukan" });

    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch {
        res.status(403).json({ error: "Token tidak valid" });
    }
};



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


app.get("/blogs", async (req, res) => {
    const blogs = await readJSON(BLOGS_FILE);
    res.json(blogs.map(({ id, title, author, created_at, image_url }) => ({ id, title, author, created_at, image_url })));
});

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


app.post("/add/blog", authenticate, upload.single("image"), async (req, res) => {
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
        image_url: req.file ? `/uploads/${req.file.filename}` : null
    };
    blogs.push(newBlog);
    await writeJSON(BLOGS_FILE, blogs);
    res.status(201).json(newBlog);
});


app.delete("/blog/:id", authenticate, async (req, res) => {
    let blogs = await readJSON(BLOGS_FILE);
    blogs = blogs.filter(b => b.id !== parseInt(req.params.id));
    await writeJSON(BLOGS_FILE, blogs);
    res.json({ message: "Blog berhasil dihapus" });
});


app.listen(PORT, () => console.log(`Server berjalan..`));
