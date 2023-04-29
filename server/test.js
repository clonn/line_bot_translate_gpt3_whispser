// test openai api complete
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: 'KEY',
});
const openai = new OpenAIApi(configuration);

async function getTranslateByOpenAI (
  text,
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
            only translate user text,
            return json format {zh, id}
          `
        },
        {
          role: "user",
          content: text
        }
      ], 
    });
    // console.log(completion.data);
    console.log(completion.data.choices[0].message.content);
    return completion.data.choices[0].message.content || false;
}

try {
  getTranslateByOpenAI('你需要好好的休息嗎？');
} catch (err) {
  console.log(err);
}