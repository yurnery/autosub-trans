import { fs, path, $, cd, sleep } from "zx";
import { fetchData } from "./net.mjs";
import { dir, secretId, secretKey, videoLan } from "./config.mjs";
const fsp = fs.promises;

let enemyLineReg = /^\n/m;
let lineReg = /\n/m;
let maxChar = 5800;
let token = 0;

function lastElement(arr) {
  return arr[arr.length - 1];
}

async function genSrt(video) {
  const srtName = path.parse(video).name + ".srt";
  const srtPath = path.resolve(srtName);
  const isExist = await fs.exists(srtPath);
  if (!isExist) {
    await $`autosub -S ${videoLan} -D ${videoLan} ${video}`;
  }
  return srtName;
}

async function translate(item) {
  const filename = path.resolve(item);
  const { texts, sentenceParts } = await extractSentences(filename);
  token += texts.join("\n").length;
  const results = await fetchTranslate(texts);

  sentenceParts.forEach((partArr, index) => {
    partArr[partArr.length - 1] += "\n" + results[index];
  });

  let merged = sentenceParts.map((item) => item.join("\n")).join("\n\n");
  await fsp.writeFile(path.resolve(item), merged, { flag: "w+" });
}

async function extractSentences(filename) {
  const content = await fsp.readFile(filename, "utf-8");
  // 原文句子
  const oriSentences = content.split(enemyLineReg);
  // 提取出要翻译的句子
  let texts = [];
  let temp = "";

  // 原文的组成部分
  const sentenceParts = oriSentences.map((sentence, index) => {
    sentence = sentence.trim();
    const parts = sentence.split(lineReg);
    const speech = lastElement(parts);
    const newSentence = speech + "\n";
    const newLength = temp.length + newSentence.length;
    if (newLength >= maxChar) {
      texts.push(temp.trimEnd());
      temp = newSentence;
    } else {
      temp += newSentence;
      if (index === oriSentences.length - 1) {
        texts.push(temp.trimEnd());
        temp = "";
      }
    }
    return parts;
  });

  return {
    texts,
    sentenceParts,
  };
}

async function fetchTranslate(texts) {
  let result = [];
  for (let i = 0; i < texts.length; i++) {
    let text = texts[i];
    const results = await fetchData(text);
    const transSentences = results.TargetText.split(lineReg);
    result = result.concat(transSentences);
  }
  return result;
}

function shouldTrans() {
  return !!secretId && !!secretKey;
}

async function main(dir) {
  cd(dir);
  const allFiles = await fsp.readdir(process.cwd());
  const videos = allFiles.filter((f) => f.endsWith(".mp4"));
  const srts = await Promise.all(
    videos.map((file) => genSrt(path.resolve(process.cwd(), file)))
  );

  if (!shouldTrans()) return;
  for (const file of srts) {
    await translate(path.resolve(process.cwd(), file));
    await sleep(200);
  }
}

if (!dir) {
  console.log("====❌❌❌: please config workDir in .env file");
  process.exit(-1);
} else {
  main(dir);
}
