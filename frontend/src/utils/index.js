import SparkMD5 from "spark-md5";
import axios from "axios";

const CHUNK_SIZE = 5 * 1024 * 1024;
const BASE_URL = "http://localhost:2024";

/**
 * 创建 file chunks
 */
export function createChunks(file, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < file.size; i += size) {
    chunks.push(file.slice(i, i + size));
  }
  return chunks;
}

/**
 * 计算hash
 */
export function calculateFileHash(chunkList) {
  return new Promise((resolve) => {
    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();
    // 抽取chunk
    const chunks = [];
    for (let i = 0; i < chunkList.length; i++) {
      const chunk = chunkList[i];
      if (i === 0 || i === chunkList.length - 1) {
        chunks.push(chunk);
      } else {
        chunks.push(chunk.slice(0, 2));
        chunks.push(chunk.slice(CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2));
        chunks.push(chunk.slice(CHUNK_SIZE - 2, CHUNK_SIZE));
      }
    }
    reader.readAsArrayBuffer(new Blob(chunks));
    reader.onload = (e) => {
      spark.append(e.target.result);
      resolve(spark.end());
    };
  });
}

/**
 * 创建formData
 */
export function createFormData(fileChunks, hash, existentChunks) {
  // 如果切片有损坏，切片大小可能就不等于CHUNK_SIZE，重新传
  const existentChunksName = existentChunks
    .filter((item) => item.size === CHUNK_SIZE)
    .map((item) => item.filename);

  return fileChunks
    .map((chunk, index) => ({
      fileHash: hash,
      chunkHash: `${hash}-${index}`,
      chunk,
    }))
    .filter(({ chunkHash }) => {
      return !existentChunksName.includes(`chunk-${chunkHash}`);
    })
    .map(({ fileHash, chunkHash, chunk }) => {
      const formData = new FormData();
      formData.append("fileHash", fileHash);
      formData.append("chunkHash", chunkHash);
      formData.append(`chunk-${chunkHash}`, chunk);
      return formData;
    });
}

/**
 * 控制并发请求数
 */
export function concurrentChunksUpload(
  sourceToken,
  dataList,
  progresses,
  max = 6
) {
  console.log(dataList);
  return new Promise((resolve) => {
    if (dataList.length === 0) {
      resolve([]);
      return;
    }
    const dataLength = dataList.length;
    const results = [];
    // 下一个请求
    let next = 0;
    // 请求完成数量
    let finished = 0;

    async function _request() {
      // 达到dataList个数，就停止
      if (next === dataLength) {
        return;
      }
      const i = next;
      next++;

      const formData = dataList[i];
      const chunkName = `chunk-${formData.get("chunkHash")}`;
      const url = `${BASE_URL}/upload-chunks?chunkName=${chunkName}`;
      try {
        const res = await axios.post(url, formData, {
          cancelToken: sourceToken,
        });
        results[i] = res.data;
        finished++;
        // 所有请求完成就执行resolve()
        if (finished === dataLength) {
          resolve(results);
        }
        _request();
      } catch (err) {
        console.log(err);
      }
    }
    // 最大并发数如果大于formData个数，取最小数
    const minTimes = Math.min(max, dataLength);
    for (let i = 0; i < minTimes; i++) {
      _request();
    }
  });
}

/**
 * 合并chunks
 */
export function mergeChunks(filename) {
  return axios.post(BASE_URL + "/merge-chunks", { filename, size: CHUNK_SIZE });
}

/**
 * 获取已经上传的切片
 */
export function getExistentChunks() {
  return axios.post(BASE_URL + "/existent-chunks");
}
