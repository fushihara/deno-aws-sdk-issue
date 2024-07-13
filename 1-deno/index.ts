import { Readable } from "node:stream";
import { request } from "node:https";
import { Buffer } from "node:buffer"
import { createReadStream } from "node:fs";
console.log(`start program`);
(async () => {
  const runtime = (() => {
    //@ts-ignore
    if (globalThis.Deno) {
      return "Deno";
    } else {
      return "Node";
    }
  })();
  const body = createReadStream("./test.bin");
  const dataFeeder = getChunkStreamx(body, 5_242_880);
  type hash = {
    willSendBinaryHash: string;
    serverReceivedBinaryHash: string;
  };
  let v1: hash | null = null;
  let v2: hash | null = null;
  for await (const dataPart of dataFeeder) {
    if (dataPart.partNumber == 2) {
      v2 = await getBufferSha256Hash(dataPart.data);
    } else if (dataPart.partNumber == 1) {
      v1 = await getBufferSha256Hash(dataPart.data);
    }
  }
  if (v1 && v2) {
    console.log(`runtime is "${runtime}"`);
    const v1Hash = "e315c42e74dd287ec00f608965e6c1dad45c3d2560255148c1e985cd404b5bc0";
    const v2Hash = "749d27efcde2194c9b0d6692bad5880740f90e70a5e4200b3e0ace34744b3102";
    if (runtime == "Deno") {
      assert(v1.serverReceivedBinaryHash == v1Hash);
      assert(v1.willSendBinaryHash == v1Hash);
      assert(v2.serverReceivedBinaryHash == "6fdb427a9655231378d35541c14ded99a0c7fc7ccfd8b8d33db4312bc73e6feb");
      assert(v2.willSendBinaryHash == v2Hash);
    } else if (runtime == "Node") {
      assert(v1.serverReceivedBinaryHash == v1Hash);
      assert(v1.willSendBinaryHash == v1Hash);
      assert(v2.serverReceivedBinaryHash == v2Hash);
      assert(v2.willSendBinaryHash == v2Hash);
    }
    console.log(`hash ${v2.willSendBinaryHash} vs ${v2.serverReceivedBinaryHash}`);
  } else {
    throw new Error("value not set");
  }
  console.log(`all success`);
})();
function assert(flag: boolean) {
  if (flag == false) {
    throw new Error();
  }
}
async function* getChunkStreamx(data: Readable, partSize: any) {
  let partNumber = 1;
  let chunks: Uint8Array[] = [];
  let bufLength = 0;
  for await (const chunk of data) {
    if (!(chunk instanceof Uint8Array)) {
      continue;
    }
    chunks.push(chunk);
    bufLength += chunk.byteLength;
    while (bufLength > partSize) {
      const dataChunk = Buffer.concat(chunks);
      const newData: Uint8Array = dataChunk.subarray(0, partSize);
      yield {
        partNumber,
        data: newData,
      };
      chunks = [dataChunk.subarray(partSize)];
      bufLength = chunks[0].byteLength;
      partNumber += 1;
    }
  }
  if (chunks.length !== 1) {
    throw new Error();
  }
  const resultData1 = chunks[0];
  yield {
    partNumber,
    data: resultData1,
    lastPart: true
  };
}


async function getBufferSha256Hash(requestBody: Uint8Array) {
  async function buffer2Sha256Hex(input: Uint8Array) {
    const buf2hex = (arrayBuffer: ArrayBuffer) => {
      return [...new Uint8Array(arrayBuffer)]
        .map(x => x.toString(16).padStart(2, '0')).join('');
    }
    const hashBuffer = await crypto.subtle.digest("SHA-256", input);
    const calHex = buf2hex(hashBuffer);
    return calHex;
  }
  const serverReceivedBin = await getHttpRequestSendUint8Array(requestBody);
  const serverReceivedBinaryHash = await buffer2Sha256Hex(serverReceivedBin);
  const willSendBinaryHash = await buffer2Sha256Hex(requestBody);
  return {
    willSendBinaryHash,
    serverReceivedBinaryHash
  }
};

async function getHttpRequestSendUint8Array(buf: Uint8Array) {
  const receiveBuffer = await new Promise<Buffer>(resolve => {
    const reqHttpbin = request({
      host: "httpbin.org",
      method: "PUT",
      path: "/anything",
    }, (res) => {
      const datas: Buffer[] = [];
      res.on('data', (chunk) => {
        if (Buffer.isBuffer(chunk)) {
          datas.push(chunk);
        }
      }); 
      res.on('end', () => {
        const buffer = Buffer.concat(datas);
        resolve(buffer);
      });
    });
    reqHttpbin.end(buf);
  });
  function decodeBase64(str: string) {
    const buffer = Buffer.from(str, 'base64');
    return buffer;
  }
  const httpBinResponseObj = JSON.parse(new TextDecoder().decode(receiveBuffer));
  const serverReceivedBin = decodeBase64(String(httpBinResponseObj.data).replace("data:application/octet-stream;base64,", ""));
  return serverReceivedBin;
}