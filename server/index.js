const linebot = require('linebot');
const express = require('express');
const { promisify } = require('util');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
const WHSIPER_API = process.env.WHSIPER_API;
console.log('WHSIPER_API', WHSIPER_API);
// 設定 Line Bot API 的 Channel Secret 和 Channel Access Token
const bot = linebot({
  channelId: process.env.CHANNEL_ID,
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

function isZH(langCode) {
  return (langCode == 'zh');
};

async function getTranslateByOpenAI (
  text,
  source = 'zh',
  target = 'id',
) {
  if (!text) return;
  
  const completion = await openai.createChatCompletion({ 
      model: "gpt-3.5-turbo",
      max_tokens: 100,
      temperature: 0.2,
      // replace prompt with messages and set prompt as content with a role.
      messages: [{
          role: "system",
          content: `
            you r a translator pro,
            only translate user text
            translate from ${source} to ${target},
            only reply to me the result as json format { target : "translated_content" }
          `
        },
        {
          role: "user",
          content: `翻譯: ${text}`
        }
      ], 
    });
    console.log(completion.data);
    console.log(completion.data.choices[0].message.content);
    const str = completion.data.choices[0].message.content;
    const regex = /{.*?}/s; // a regular expression to match the JSON object string
    const matches = str.match(regex); // an array of matches found in the input string
    if (matches && matches.length > 0) {
      const jsonStr = matches[0]; // extract the first match (which should be the JSON object string)
      return jsonStr
      // const jsonObject = JSON.parse(jsonStr); // parse the JSON object string into a JavaScript object
      // console.log(jsonObject); // output: {"zh": "你什么时候会需要会请给你的小孩", "id": "Kapan kamu akan membutuhkannya untuk meminta anakmu"}
    } else {
      return false;
    }
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 監聽 Line Bot 的 Webhook
app.post('/webhook', (req, res) => {
  console.log('Webhook triggered');

  bot.parse(req.body);

  res.sendStatus(200);
});

app.get('/', (req, res) => {
  // console.log(req);
  return res.end('ok');
});

// 處理 Line Bot 收到的訊息事件

const writeFileAsync = promisify(fs.writeFile);

bot.on('message', async event => {
  console.log(event);
  if (event.message.type === 'text') {
    if (event.message.text ==='test') {
      await event.reply(`test: ${event.message.text}`);    
    }
  //   await event.reply(`test: ${event.message.text}`);
  }
  if (event.message.type === 'audio') {
    try {

      // 下載聲音檔案
      const audioResponse = await axios({
        method: 'get',
        url: `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${channelAccessToken}`
        }
      });

      // console.log(audioResponse);

      // 將聲音檔案保存到臨時檔案
      // save file to .tmp folder
      const audioFilePath = path.join('.tmp', `tmp_audio_${event.message.id}.wav`);      
      await writeFileAsync(audioFilePath, Buffer.from(audioResponse.data), 'binary');


      let formData = new FormData();
      // Append the saved audio file to the FormData object
      formData.append('audio_file', fs.createReadStream(audioFilePath));

      // Send the file to the specified endpoint using axios
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${WHSIPER_API}/detect-language`,
        headers: { 
          ...formData.getHeaders()
        },
        data : formData
      };

      const response = await axios.request(config)

      // Handle the response from the server
      console.log('API response:', response.data);
      // { detected_language: 'chinese', language_code: 'zh' }
      console.log('Detected language:', response.data.language_code);
      const detectedLanguage = response.data.language_code;

      formData = new FormData();
      formData.append('audio_file', fs.createReadStream(audioFilePath));
      formData.append('task', 'translate');
      formData.append('language', isZH(detectedLanguage) ? 'zh': 'id');
      formData.append('output', 'json');

      config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${WHSIPER_API}/asr`,
        headers: { 
          ...formData.getHeaders()
        },
        data : formData
      };

      // console.log(config);
      const responseText = await axios.request(config)
      console.log(responseText);

      // check responseText.data and length shorter than 0
      // otherwise, return error message
      if (responseText.data && responseText.data.length < 0) {
        await event.reply(`Message read error`);
        return;
      }

      const translatedObj = await getTranslateByOpenAI(
        responseText.data,
        isZH(detectedLanguage) ? 'zh': 'id',
        isZH(detectedLanguage) ? 'id': 'zh',
      );
      console.log(translatedObj);
      console.log(typeof translatedObj);
      let translatedData = {
        target: '翻譯失敗',
      };
      try {
        translatedData = JSON.parse(translatedObj);
      } catch (error) {
        console.log('format type error');
        await event.reply(`Translate failed`);
        return;
      }
      const origin = responseText.data;
      const translated = translatedData.target;
      // 回覆轉換後的文字訊息
      await event.reply([  
        {type:'text', text:`origin: ${origin}`},
        {type:'text', text:`translated: ${translated}`},  
      ]);

      // 刪除臨時檔案
      fs.unlink(audioFilePath, (err) => {
        if (err) console.error(`Error deleting temporary audio file: ${err}`);
      });

    } catch (error) {
      console.error(`Error processing audio message: ${error}`);
      await event.reply('抱歉，我無法處理您的聲音訊息。');
    }
  }
});


// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Line Bot listening on port ${port}`);
});