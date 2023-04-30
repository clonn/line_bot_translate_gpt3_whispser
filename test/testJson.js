function formatJSON(inputText) {
  if (!inputText || inputText.length < 0) {
    return false;
  }

  const jsonRegEx = /{[\s\S]*?}/;
  let jsonMatch = inputText.match(jsonRegEx);

  if (!jsonMatch) {
    const open = '{';
    const close = '"}';
    const openingBraceIndex = inputText.indexOf(open);
    const closingBraceIndex = inputText.lastIndexOf(close);

    if (openingBraceIndex !== -1) {
      const jsonString = `${inputText.slice(openingBraceIndex)}${close}`;
      console.log('jsonString:', jsonString);
      jsonMatch = [jsonString];
    }
  }

  if (jsonMatch) {
    const jsonString = jsonMatch[0];

    try {
      JSON.parse(jsonString);
      return jsonString;
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return false;
    }
  } else {
    console.error('No JSON found in input text');
    return false;
  }
}

formatJSON('{"zh": "我也很厉害，因为我丈夫说，一切都已经安排好了，所以我只需要像那样跟随那个人就可以了。", "id": "Saya juga keren tau kebualan, karena pemen suami saya bilang, ketanya semua sudah di urus dari lama, jadi saya tinggal dengan orang itu jen');

