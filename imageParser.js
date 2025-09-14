const fs = require('fs').promises;
const path = require('path');
const extractPngChunks = require('png-chunks-extract');
const exifParser = require('exif-parser');

function parseTextChunk(chunkData) {
    const nullSeparatorIndex = chunkData.indexOf(0);
    if (nullSeparatorIndex === -1) return null;
    const keyword = Buffer.from(chunkData.slice(0, nullSeparatorIndex)).toString('utf-8');
    const text = Buffer.from(chunkData.slice(nullSeparatorIndex + 1)).toString('utf-8');
    return { keyword, text };
}

async function extractFromPng(buffer) {
    const chunks = extractPngChunks(buffer);
    console.log(`발견된 청크: ${chunks.map(c => c.name).join(', ')}`);
    const textChunks = chunks.filter(chunk => chunk.name === 'tEXt' || chunk.name === 'iTXt');
    if (textChunks.length === 0) {
        console.log('tEXt 또는 iTXt 청크를 찾을 수 없습니다.');
        return null;
    }
    for (const chunk of textChunks) {
        const parsed = parseTextChunk(chunk.data);
        if (!parsed) continue;
        console.log(`'${chunk.name}' 청크 발견: Keyword='${parsed.keyword}'`);
        if (parsed.keyword === 'parameters' || parsed.keyword === 'Description') {
            console.log(`'${parsed.keyword}' 키워드에서 프롬프트를 찾았습니다!`);
            return parsed.text;
        }
    }
    return null;
}

async function extractFromJpeg(buffer) {
    try {
        const parser = exifParser.create(buffer);
        const result = parser.parse();
        // Stable Diffusion WebUI는 프롬프트를 'UserComment' 태그에 저장합니다.
        if (result && result.tags && result.tags.UserComment) {
            console.log("EXIF 'UserComment' 태그에서 프롬프트를 찾았습니다!");
            // UserComment는 종종 숫자 배열(charCode)로 저장되므로 문자열로 변환합니다.
            return Buffer.from(result.tags.UserComment).toString('utf-8').replace(/\0/g, '').trim();
        }
        console.log('EXIF 메타데이터에서 프롬프트를 찾지 못했습니다.');
        return null;
    } catch (error) {
        console.error('JPEG EXIF 파싱 중 오류:', error.message);
        return null;
    }
}

async function extractPromptFromImage(filePath) {
    try {
        console.log(`--- [${path.basename(filePath)}] 이미지 청크 분석 시작 ---`);
        const buffer = await fs.readFile(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        let prompt = null;
        if (fileExt === '.png') {
            prompt = await extractFromPng(buffer);
        } else if (fileExt === '.jpg' || fileExt === '.jpeg') {
            prompt = await extractFromJpeg(buffer);
        } else {
            console.log(`지원하지 않는 파일 형식입니다: ${fileExt}`);
        }

        if (!prompt) {
            console.log('이미지에서 프롬프트 관련 메타데이터를 찾지 못했습니다.');
        }
        console.log('--- 분석 종료 ---');
        return prompt;

    } catch (error) {
        console.error(`이미지 파싱 중 오류 발생 (${filePath}):`, error.message);
        console.log('--- 분석 종료 ---');
        return null;
    }
}

module.exports = { extractPromptFromImage };