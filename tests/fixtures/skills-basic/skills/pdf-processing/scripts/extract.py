#!/usr/bin/env python3
"""Extract text from PDF files."""

def extract_text(pdf_path):
    print(f"Extracting text from {pdf_path}")
    return "Extracted text"

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        print(extract_text(sys.argv[1]))

