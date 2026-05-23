import * as fs from "fs/promises"
import * as path from "path"
import mammoth from "mammoth"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import JSZip from "jszip"
import {
  auditDocParseStart,
  auditDocParseDone,
  auditDocParseError,
} from "@/lib/audit-logger"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse")

export interface ParsedDocument {
  content: string
  metadata: Record<string, unknown>
}

async function parseMarkdown(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()
  let fileSize = 0

  try {
    auditDocParseStart(fileName, "markdown")
    const content = await fs.readFile(filePath, "utf-8")
    fileSize = content.length
    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "markdown", durationMs, {
      size: fileSize,
      char_count: content.length,
    })
    return {
      content,
      metadata: {
        type: "markdown",
        fileName,
        size: fileSize,
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "markdown", error, durationMs, { filePath })
    throw error
  }
}

async function parseTxt(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()

  try {
    auditDocParseStart(fileName, "text")
    const content = await fs.readFile(filePath, "utf-8")
    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "text", durationMs, {
      size: content.length,
      char_count: content.length,
    })
    return {
      content,
      metadata: {
        type: "text",
        fileName,
        size: content.length,
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "text", error, durationMs, { filePath })
    throw error
  }
}

async function parseCsv(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()

  try {
    auditDocParseStart(fileName, "csv")
    const fileContent = await fs.readFile(filePath, "utf-8")
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true })
    const content = JSON.stringify(parsed.data)
    const rowCount = Array.isArray(parsed.data) ? parsed.data.length : 0
    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "csv", durationMs, {
      size: fileContent.length,
      row_count: rowCount,
      header_count: parsed.meta.fields?.length || 0,
    })
    return {
      content,
      metadata: {
        type: "csv",
        fileName,
        rowCount,
        headers: parsed.meta.fields || [],
        size: fileContent.length,
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "csv", error, durationMs, { filePath })
    throw error
  }
}

async function parseDocx(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()

  try {
    auditDocParseStart(fileName, "docx")
    const buffer = await fs.readFile(filePath)
    const result = await mammoth.extractRawText({ buffer })
    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "docx", durationMs, {
      size: buffer.length,
      char_count: result.value.length,
      warning_count: result.messages.length,
    })
    return {
      content: result.value,
      metadata: {
        type: "docx",
        fileName,
        size: buffer.length,
        warnings: result.messages.map((m) => m.message),
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "docx", error, durationMs, { filePath })
    throw error
  }
}

async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()

  try {
    auditDocParseStart(fileName, "pdf")
    const buffer = await fs.readFile(filePath)
    const result = await pdfParse(buffer)
    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "pdf", durationMs, {
      size: buffer.length,
      page_count: result.numpages,
      text_length: result.text?.length || 0,
    })
    return {
      content: result.text,
      metadata: {
        type: "pdf",
        fileName,
        pageCount: result.numpages,
        info: result.info,
        size: buffer.length,
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "pdf", error, durationMs, { filePath })
    throw error
  }
}

async function parseExcel(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()

  try {
    auditDocParseStart(fileName, "excel")
    const workbook = XLSX.readFile(filePath)
    const sheets: Record<string, string[][]> = {}

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      sheets[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]
    }

    const content = JSON.stringify(sheets)
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const range = XLSX.utils.decode_range(firstSheet["!ref"] || "A1")
    const rowCount = range.e.r - range.s.r + 1
    const columnCount = range.e.c - range.s.c + 1
    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "excel", durationMs, {
      sheet_count: workbook.SheetNames.length,
      row_count: rowCount,
      col_count: columnCount,
    })
    return {
      content,
      metadata: {
        type: "excel",
        fileName,
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        rowCount,
        columnCount,
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "excel", error, durationMs, { filePath })
    throw error
  }
}

async function parseWps(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()

  try {
    auditDocParseStart(fileName, "wps")
    const buffer = await fs.readFile(filePath)
    const zip = new JSZip()
    await zip.loadAsync(buffer)

    const documentXml = await zip.file("document.xml")?.async("string")
    let content: string
    if (documentXml) {
      content = extractTextFromXml(documentXml)
    } else {
      const textFiles = Object.keys(zip.files).filter(
        (name) => name.startsWith("word/") && name.endsWith(".xml")
      )
      let combinedText = ""
      for (const textFile of textFiles) {
        const xmlContent = await zip.file(textFile)?.async("string")
        if (xmlContent) {
          combinedText += extractTextFromXml(xmlContent) + "\n"
        }
      }
      content = combinedText.trim()
    }

    const durationMs = Date.now() - startTime
    auditDocParseDone(fileName, "wps", durationMs, {
      size: buffer.length,
      char_count: content.length,
    })
    return {
      content,
      metadata: {
        type: "wps",
        fileName,
        size: buffer.length,
        parseDurationMs: durationMs,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, "wps", error, durationMs, { filePath })
    throw error
  }
}

function extractTextFromXml(xml: string): string {
  const textMatches = xml.match(/<[^>]+>([^<]*)<\/[^>]+>/g) || []
  return textMatches
    .map((match) => {
      const content = match.replace(/<[^>]+>/g, "")
      return content.trim()
    })
    .filter((text) => text.length > 0)
    .join("\n")
}

async function parseImage(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath)
  const startTime = Date.now()
  auditDocParseStart(fileName, "image")
  const durationMs = Date.now() - startTime
  auditDocParseDone(fileName, "image", durationMs, {
    note: "跳过图片解析，需客户端处理",
  })
  return {
    content: "",
    metadata: {
      type: "image",
      fileName,
      note: "图片解析需要在客户端进行",
      parseDurationMs: durationMs,
    },
  }
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase()
  const fileName = path.basename(filePath)

  switch (ext) {
    case ".md":
    case ".markdown":
      return parseMarkdown(filePath)
    case ".txt":
      return parseTxt(filePath)
    case ".csv":
      return parseCsv(filePath)
    case ".docx":
      return parseDocx(filePath)
    case ".pdf":
      return parsePdf(filePath)
    case ".xlsx":
    case ".xls":
      return parseExcel(filePath)
    case ".wps":
      return parseWps(filePath)
    case ".jpg":
    case ".jpeg":
    case ".png":
    case ".gif":
    case ".bmp":
    case ".webp":
      return parseImage(filePath)
    default: {
      const startTime = Date.now()
      try {
        auditDocParseStart(fileName, "unknown")
        const content = await fs.readFile(filePath, "utf-8")
        const durationMs = Date.now() - startTime
        auditDocParseDone(fileName, "unknown", durationMs, {
          extension: ext,
          size: content.length,
        })
        return {
          content,
          metadata: {
            type: "unknown",
            fileName,
            extension: ext,
            size: content.length,
            parseDurationMs: durationMs,
          },
        }
      } catch (error) {
        const durationMs = Date.now() - startTime
        auditDocParseError(fileName, "unknown", error, durationMs, {
          extension: ext,
          filePath,
        })
        throw error
      }
    }
  }
}

export async function parseDocumentFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  const ext = path.extname(fileName).toLowerCase()
  const startTime = Date.now()
  const fileType = ext.slice(1) || "unknown"

  try {
    auditDocParseStart(fileName, fileType, buffer.length)

    let result: ParsedDocument

    switch (ext) {
      case ".md":
      case ".markdown":
      case ".txt": {
        const content = buffer.toString("utf-8")
        result = {
          content,
          metadata: { type: ext.slice(1), fileName, size: buffer.length },
        }
        break
      }
      case ".csv": {
        const content = buffer.toString("utf-8")
        const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
        result = {
          content: JSON.stringify(parsed.data),
          metadata: {
            type: "csv",
            fileName,
            rowCount: Array.isArray(parsed.data) ? parsed.data.length : 0,
            headers: parsed.meta.fields || [],
            size: buffer.length,
          },
        }
        break
      }
      case ".docx": {
        const docxResult = await mammoth.extractRawText({ buffer })
        result = {
          content: docxResult.value,
          metadata: {
            type: "docx",
            fileName,
            size: buffer.length,
          },
        }
        break
      }
      case ".pdf": {
        const pdfResult = await pdfParse(buffer)
        result = {
          content: pdfResult.text,
          metadata: {
            type: "pdf",
            fileName,
            pageCount: pdfResult.numpages,
            size: buffer.length,
          },
        }
        break
      }
      case ".xlsx":
      case ".xls": {
        const workbook = XLSX.read(buffer)
        const sheets: Record<string, string[][]> = {}
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          sheets[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]
        }
        result = {
          content: JSON.stringify(sheets),
          metadata: {
            type: "excel",
            fileName,
            sheetNames: workbook.SheetNames,
            size: buffer.length,
          },
        }
        break
      }
      case ".wps": {
        const zip = new JSZip()
        await zip.loadAsync(buffer)
        const documentXml = await zip.file("document.xml")?.async("string")
        const content = documentXml ? extractTextFromXml(documentXml) : ""
        result = {
          content,
          metadata: { type: "wps", fileName, size: buffer.length },
        }
        break
      }
      case ".jpg":
      case ".jpeg":
      case ".png":
      case ".gif":
      case ".bmp":
      case ".webp": {
        result = {
          content: "",
          metadata: {
            type: "image",
            fileName,
            size: buffer.length,
            note: "图片解析需要在客户端进行",
          },
        }
        break
      }
      default: {
        const content = buffer.toString("utf-8")
        result = {
          content,
          metadata: { type: "unknown", fileName, extension: ext, size: buffer.length },
        }
      }
    }

    const durationMs = Date.now() - startTime
    result.metadata.parseDurationMs = durationMs
    auditDocParseDone(fileName, fileType, durationMs, {
      size: buffer.length,
      char_count: result.content.length,
      ...(result.metadata as Record<string, unknown>),
    })
    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    auditDocParseError(fileName, fileType, error, durationMs, {
      extension: ext,
      buffer_size: buffer.length,
    })
    throw error
  }
}
