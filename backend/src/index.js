const path = require("path");
const fs = require("fs");
const Koa = require("koa");
const KoaRouter = require("@koa/router");
const cors = require("@koa/cors");
const { koaBody } = require("koa-body");

const router = new KoaRouter();
// 保存切片目录
const chunksDir = path.resolve(__dirname, "../chunks");

// 中间件:处理multipart/form-data，切片写入磁盘
const uploadKoaBody = koaBody({
  multipart: true,
  formidable: {
    // 设置文件夹
    uploadDir: chunksDir,
    // 在保存到磁盘前回调
    onFileBegin(name, file) {
      if (!fs.existsSync(chunksDir)) {
        fs.mkdirSync(chunksDir);
      }
      // 切片重命名
      file.filepath = `${chunksDir}/${name}`;
    },
  },
});

// 中间件，已经存在的切片，直接返回成功结果
async function verifyChunks(ctx, next) {
  const chunkName = ctx.request.querystring.split("=")[1];
  const chunkPath = path.resolve(chunksDir, chunkName);
  if (fs.existsSync(chunkPath)) {
    ctx.body = { code: 200, msg: "文件已上传" };
  } else {
    await next();
  }
}

// 上传chunks切片接口
router.post("/upload-chunks", verifyChunks, uploadKoaBody, (ctx) => {
  ctx.body = { code: 200, msg: "文件上传成功" };
});

// 合并chunks接口
router.post("/merge-chunks", koaBody(), async (ctx) => {
  const { filename, size } = ctx.request.body;
  await mergeChunks(filename, size);
  ctx.body = { code: 200, msg: "合并成功" };
});

// 合并 chunks
async function mergeChunks(filename, size) {
  // 读取chunks目录中的文件名
  const chunksName = fs.readdirSync(chunksDir);
  if (!chunksName.length) return;
  // 保证切片合并顺序
  chunksName.sort((a, b) => a.split("-")[2] - b.split("-")[2]);
  // 提前创建要写入的static目录
  const fileDir = path.resolve(__dirname, "../static");
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir);
  }
  // 最后写入的文件路径
  const filePath = path.resolve(fileDir, filename);
  const pipeStreams = chunksName.map((chunkName, index) => {
    const chunkPath = path.resolve(chunksDir, chunkName);
    // 创建写入流
    const writeStream = fs.createWriteStream(filePath, { start: index * size });
    return createPipeStream(chunkPath, writeStream);
  });
  await Promise.all(pipeStreams);
  // 全部写完，删除chunks切片目录
  fs.rmdirSync(chunksDir);
}

// 创建管道流写入
function createPipeStream(chunkPath, writeStream) {
  return new Promise((resolve) => {
    const readStream = fs.createReadStream(chunkPath);
    readStream.pipe(writeStream);
    readStream.on("end", () => {
      // 写完一个chunk，就删除
      fs.unlinkSync(chunkPath);
      resolve();
    });
  });
}

// 获取已经上传的切片接口
router.post("/existent-chunks", (ctx) => {
  if (!fs.existsSync(chunksDir)) {
    ctx.body = [];
    return;
  }
  ctx.body = fs.readdirSync(chunksDir).map((filename) => {
    return {
      filename,
      size: fs.statSync(`${chunksDir}/${filename}`).size,
    };
  });
});

const app = new Koa();
app.use(cors()); //解决跨域
app.use(router.routes()).use(router.allowedMethods());
app.listen(2024, () => console.log("Koa文件服务器启动"));
