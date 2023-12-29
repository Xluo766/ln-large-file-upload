<script setup>
import { ref } from "vue";
import axios from "axios";
import {
  createChunks,
  calculateFileHash,
  createFormData,
  concurrentChunksUpload,
  mergeChunks,
  getExistentChunks,
} from "./utils";

const CancelToken = axios.CancelToken;
let axiosSource = CancelToken.source();

const fileChunks = ref([]);
const originFile = ref({});

function handleFileChange(e) {
  const file = e.target.files[0];
  if (!file) {
    return;
  }
  originFile.value = file;
  fileChunks.value = createChunks(file);
}

async function uploadChunks(existentChunks = []) {
  const hash = await calculateFileHash(fileChunks.value);
  const dataList = createFormData(fileChunks.value, hash, existentChunks);
  axiosSource = CancelToken.source();
  await concurrentChunksUpload(axiosSource.token, dataList);
  // 等所有chunks发送完毕，发送合并请求
  mergeChunks(originFile.value.name);
}

function pauseUpload() {
  axiosSource.cancel?.();
}

async function continueUpload() {
  const { data } = await getExistentChunks();
  uploadChunks(data);
}
</script>

<template>
  <input type="file" @change="handleFileChange" />
  <button @click="uploadChunks()">上传</button>
  <button @click="pauseUpload">暂停</button>
  <button @click="continueUpload">继续</button>

  <div></div>
</template>

<style scoped></style>
