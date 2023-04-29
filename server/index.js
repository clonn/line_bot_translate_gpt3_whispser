const linebot = require('linebot');
const express = require('express');
const { promisify } = require('util');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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
            return json format {zh, id}
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
    return completion.data.choices[0].message.content || false;
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

// 處理 Line Bot 收到的訊息事件

const writeFileAsync = promisify(fs.writeFile);

bot.on('message', async event => {
  console.log(event);
  // if (event.message.type === 'text') {
  //   await event.reply(`test: ${event.message.text}`);
  // }
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
        url: 'http://127.0.0.1:9000/detect-language',
        headers: { 
          ...formData.getHeaders()
        },
        data : formData
      };

      const response = await axios.request(config)

      // Handle the response from the server
      console.log('API response:', response.data);
      // { detected_language: 'chinese', language_code: 'zh' }
      console.log('Detected language:', response.data.langauge_code);
      const detectedLanguage = response.data.langauge_code;

      formData = new FormData();
      formData.append('audio_file', fs.createReadStream(audioFilePath));
      formData.append('task', 'translate');
      formData.append('language', isZH(detectedLanguage) ? 'zh': 'id');
      formData.append('output', 'json');

      config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://127.0.0.1:9000/asr',
        headers: { 
          ...formData.getHeaders()
        },
        data : formData
      };

      console.log(config);
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
        zh: '翻譯失敗',
        id: 'terjemahan gagal',
      };
      try {
        const buffer = JSON.parse(translatedObj);
        translatedData = {
          zh: buffer.zh,
          id: buffer.id,
        };
      } catch (error) {
        console.log('format type error');
        await event.reply(`Translate failed`);
        return;
      }
      const origin = responseText.data;
      const translated = translatedData[isZH(detectedLanguage) ? 'id': 'zh'];
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