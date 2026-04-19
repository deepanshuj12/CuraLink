const axios = require("axios");
const models = [
  "tiiuae/falcon-7b-instruct:fastest",
  "meta-llama/Llama-2-7b-chat-hf:fastest",
  "bigscience/bloomz-7b1-mt:fastest",
  "mistralai/Mistral-7B-Instruct-v0.1:fastest"
];
const headers = {
  Authorization: "Bearer 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",
  "Content-Type": "application/json"
};
(async () => {
  for (const model of models) {
    console.log('Testing', model);
    try {
      const res = await axios.post('https://router.huggingface.co/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      }, { headers, timeout: 30000 });
      console.log('SUCCESS', model, res.status, res.data.choices?.[0]?.message?.content);
    } catch (e) {
      console.log('FAIL', model, e.response?.status, e.response?.data || e.message);
    }
  }
})();
