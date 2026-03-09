function isUnescapedSequenceAt(input: string, index: number, sequence: string) {
  if (!input.startsWith(sequence, index)) return false;
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 0;
}

function findUnescapedSequence(input: string, sequence: string, start: number) {
  let index = input.indexOf(sequence, start);
  while (index !== -1) {
    if (isUnescapedSequenceAt(input, index, sequence)) {
      return index;
    }
    index = input.indexOf(sequence, index + 1);
  }
  return -1;
}

function normalizeDelimitersOutsideInlineCode(input: string) {
  let output = "";
  let cursor = 0;

  while (cursor < input.length) {
    if (input[cursor] === "`") {
      let tickCount = 1;
      while (input[cursor + tickCount] === "`") {
        tickCount += 1;
      }
      const fence = "`".repeat(tickCount);
      const closing = input.indexOf(fence, cursor + tickCount);
      if (closing === -1) {
        // Treat unmatched backticks as plain text and continue scanning so
        // later math delimiters in the same message can still be normalized.
        output += input[cursor];
        cursor += 1;
        continue;
      }
      output += input.slice(cursor, closing + tickCount);
      cursor = closing + tickCount;
      continue;
    }

    if (isUnescapedSequenceAt(input, cursor, "\\(")) {
      const closing = findUnescapedSequence(input, "\\)", cursor + 2);
      if (closing !== -1) {
        output += `$${input.slice(cursor + 2, closing)}$`;
        cursor = closing + 2;
        continue;
      }
    }

    if (isUnescapedSequenceAt(input, cursor, "\\[")) {
      const closing = findUnescapedSequence(input, "\\]", cursor + 2);
      if (closing !== -1) {
        output += `$$${input.slice(cursor + 2, closing)}$$`;
        cursor = closing + 2;
        continue;
      }
    }

    output += input[cursor];
    cursor += 1;
  }

  return output;
}

export function normalizeLatexDelimiters(input: string) {
  const lines = input.match(/[^\n]*\n?|$/g) ?? [input];
  let output = "";
  let outsideFence = "";
  let inFence = false;
  let fenceMarker = "";
  let fenceLength = 0;

  for (const line of lines) {
    if (!line) continue;
    const lineWithoutNewline = line.endsWith("\n") ? line.slice(0, -1) : line;

    if (!inFence) {
      const openingFence = lineWithoutNewline.match(/^ {0,3}(`{3,}|~{3,}).*$/);
      if (openingFence) {
        output += normalizeDelimitersOutsideInlineCode(outsideFence);
        outsideFence = "";
        inFence = true;
        fenceMarker = openingFence[1][0];
        fenceLength = openingFence[1].length;
        output += line;
        continue;
      }
      outsideFence += line;
      continue;
    }

    output += line;
    const closingFence = new RegExp(`^ {0,3}${fenceMarker}{${fenceLength},}[ \\t]*$`);
    if (closingFence.test(lineWithoutNewline)) {
      inFence = false;
      fenceMarker = "";
      fenceLength = 0;
    }
  }

  output += normalizeDelimitersOutsideInlineCode(outsideFence);
  return output;
}
