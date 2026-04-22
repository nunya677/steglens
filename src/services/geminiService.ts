import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function performOCR(imageBuffer: string) {
  const base64Data = imageBuffer.split(',')[1];
  const mimeType = imageBuffer.split(';')[0].split(':')[1];

  const prompt = `
    Perform a high-precision Optical Character Recognition (OCR) on this image.
    Extract all visible text, including text that might be small, distorted, or partially obscured.
    
    If no text is found, respond with "NO_TEXT_DETECTED".
    Otherwise, provide the extracted text exactly as it appears.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            }
          ]
        }
      ]
    });

    return response.text;
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to complete OCR scan.");
  }
}

export async function analyzeForensics(imageBuffer: string, extractedText: string, technicalContext?: any) {
  const base64Data = imageBuffer.split(',')[1];
  const mimeType = imageBuffer.split(';')[0].split(':')[1];

  const metadataStr = technicalContext ? JSON.stringify(technicalContext, null, 2) : "NONE_DETECTED";

  const prompt = `
    You are a Senior Digital Forensics Expert specializing in Steganalysis. 
    Analyze the provided image and the technical metadata to identify both the presence and the SPECIFIC METHOD of steganography used.
    
    Technical Context (EXIF / Binary Scans / Heuristics):
    """
    ${metadataStr}
    """

    Extracted LSB Data Fragment:
    """
    ${extractedText.slice(0, 500)}
    """
    
    Steganographic Method Classification Guide:
    - LSB (Least Significant Bit): Noise in lowest bit planes, entropy changes in raw pixels. Common for PNG/BMP.
    - Jsteg / OutGuess: Information hidden in JPEG DCT coefficients. Indicated by high DCT Anomaly scores (>30%).
    - F5 Algorithm: Advanced JPEG steganography using matrix encoding; subtle DCT variations.
    - EOI Append (Trailing Data): Data found after the "End of Image" marker (FF D9). Often used for simple concatenation.
    - Steghide: Uses a graph-theoretic approach to hide data in LSB/DCT, often combined with encryption (High Entropy).
    - Palette/Color Mapping: Hiding data in the palette order of indexed images (GIF/PNG-8).

    Tasks:
    1. Cross-reference the image with the Technical Context. Identify discrepancies in EXIF (e.g. "Software" tag mismatch or stripped headers).
    2. Analyze the "Trailing Data" and "DCT Anomaly Score". Does the score suggest coefficient manipulation (Jsteg/F5) or simple appending?
    3. Evaluate the "LSB Data Fragment". Is it high-entropy (encrypted/compressed) or structured (plain text/ciphers)?
    4. ATTEMPT TO IDENTIFY THE METHOD (e.g., "Highly probable LSB insertion", "Suspected F5/Jsteg coefficient manipulation", "Signature of EOI Append").
    
    Provide a professional forensic report in Markdown including:
       - Threat Level (Low/Medium/High)
       - Identified Method (with confidence level)
       - Detailed Findings
       - Recommended Mitigation Tools (e.g., "Use steghide --extract", "Analyze DCT with Jsteg-shell")
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            }
          ]
        }
      ]
    });

    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error("Failed to complete AI forensic analysis.");
  }
}
