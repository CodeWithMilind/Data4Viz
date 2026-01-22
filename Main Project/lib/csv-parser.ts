/**
 * CSV Parser Utility
 * Handles parsing CSV data from both file uploads and URL fetches
 */

export interface ParsedCSV {
  data: Record<string, any>[]
  headers: string[]
  rowCount: number
  columnCount: number
}

/**
 * Detect CSV delimiter by analyzing the header row
 * Returns ',' or ';' based on which appears more frequently (outside quotes)
 */
function detectDelimiter(headerLine: string): string {
  let commaCount = 0
  let semicolonCount = 0
  let inQuotes = false

  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i]
    const nextChar = headerLine[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (!inQuotes) {
      if (char === ',') {
        commaCount++
      } else if (char === ';') {
        semicolonCount++
      }
    }
  }

  // Return the delimiter with more occurrences, default to comma
  return semicolonCount > commaCount ? ';' : ','
}

/**
 * Parse CSV text into structured data
 * Auto-detects delimiter (comma or semicolon) from header row
 */
export function parseCSV(csvText: string): ParsedCSV {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length === 0) {
    throw new Error("CSV file is empty")
  }

  // Detect delimiter from header row
  let delimiter = detectDelimiter(lines[0])

  // Parse header row with detected delimiter
  let headers = parseCSVLine(lines[0], delimiter)
  let columnCount = headers.length

  // Fallback: If only one column detected with comma, try semicolon
  if (columnCount === 1 && delimiter === ',') {
    const semicolonHeaders = parseCSVLine(lines[0], ';')
    if (semicolonHeaders.length > 1) {
      // Semicolon delimiter detected - use semicolon instead
      delimiter = ';'
      headers = semicolonHeaders
      columnCount = semicolonHeaders.length
    }
  }

  // Parse data rows
  const data: Record<string, any>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue // Skip empty lines

    const values = parseCSVLine(line, delimiter)
    if (values.length !== columnCount) {
      // Handle rows with mismatched column counts by padding or truncating
      const paddedValues = [...values]
      while (paddedValues.length < columnCount) {
        paddedValues.push("")
      }
      if (paddedValues.length > columnCount) {
        paddedValues.splice(columnCount)
      }
      const row: Record<string, any> = {}
      headers.forEach((header, idx) => {
        row[header] = paddedValues[idx] || ""
      })
      data.push(row)
    } else {
      const row: Record<string, any> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx] || ""
      })
      data.push(row)
    }
  }

  return {
    data,
    headers,
    rowCount: data.length,
    columnCount,
  }
}

/**
 * Parse a single CSV line, handling quoted fields
 * @param line The CSV line to parse
 * @param delimiter The delimiter to use (',' or ';')
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      // Field separator
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  // Add last field
  values.push(current.trim())

  return values
}

/**
 * Validate URL format
 */
export function isValidURL(url: string): boolean {
  if (!url || url.trim() === "") {
    return false
  }
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === "http:" || urlObj.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Fetch CSV from URL and parse it
 */
export async function fetchAndParseCSV(url: string): Promise<ParsedCSV> {
  if (!isValidURL(url)) {
    throw new Error("Invalid URL. Please provide a valid http:// or https:// URL.")
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/csv,text/plain,*/*",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get("content-type") || ""
    // Check if response is CSV or plain text (some servers don't set proper content-type)
    if (
      !contentType.includes("text/csv") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/csv") &&
      !url.toLowerCase().endsWith(".csv")
    ) {
      // Warn but don't fail - some servers don't set proper content-type
      console.warn("Response may not be CSV. Content-Type:", contentType)
    }

    const csvText = await response.text()

    if (!csvText || csvText.trim().length === 0) {
      throw new Error("The URL returned an empty file")
    }

    return parseCSV(csvText)
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error("Network error: Could not fetch the CSV file. Please check the URL and your internet connection.")
    }
    if (error instanceof Error) {
      throw error
    }
    throw new Error("An unexpected error occurred while fetching the CSV file")
  }
}

/**
 * Parse CSV from File object
 */
export async function parseCSVFromFile(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      reject(new Error("File must be a CSV file"))
      return
    }

    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string
        if (!csvText) {
          reject(new Error("Failed to read file"))
          return
        }
        const parsed = parseCSV(csvText)
        resolve(parsed)
      } catch (error) {
        if (error instanceof Error) {
          reject(error)
        } else {
          reject(new Error("Failed to parse CSV file"))
        }
      }
    }

    reader.onerror = () => {
      reject(new Error("Failed to read file"))
    }

    reader.readAsText(file)
  })
}
