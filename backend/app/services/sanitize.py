"""Очистка служебных свойств клиентских оригиналов без изменения содержания."""
from __future__ import annotations

import asyncio
import io
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


_OFFICE = {".docx", ".pptx"}


def _blank_xml(data: bytes, *, office: bool = False) -> bytes:
    root = ET.fromstring(data)
    for el in root.iter():
        local = el.tag.rsplit("}", 1)[-1]
        if office or local in {
            "creator", "lastModifiedBy", "revision", "created", "modified",
            "printed-by", "creation-date", "editing-duration", "editing-cycles",
            "generator", "initial-creator", "keyword", "description", "subject",
            "title", "Company", "Manager", "Application", "AppVersion", "Template",
        }:
            if el.text:
                el.text = ""
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_zip(payload: bytes, ext: str) -> bytes:
    src = zipfile.ZipFile(io.BytesIO(payload), "r")
    out_buf = io.BytesIO()
    with src, zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as out:
        for info in src.infolist():
            name = info.filename
            # Custom properties are never needed for the delivered academic file.
            if name == "docProps/custom.xml":
                continue
            data = src.read(name)
            if name in ("docProps/core.xml", "docProps/app.xml"):
                data = _blank_xml(data, office=True)
            elif ext == ".odt" and name == "meta.xml":
                data = _blank_xml(data)
            out.writestr(info, data)
    return out_buf.getvalue()


def _sanitize_pdf(payload: bytes) -> bytes:
    import fitz
    doc = fitz.open(stream=payload, filetype="pdf")
    if doc.needs_pass:
        doc.close()
        raise ValueError("password_protected_pdf")
    doc.set_metadata({})
    try:
        doc.del_xml_metadata()
    except Exception:
        pass
    try:
        for name in list(doc.embfile_names()):
            doc.embfile_del(name)
    except Exception:
        pass
    cleaned = doc.tobytes(garbage=4, clean=True, deflate=True)
    doc.close()
    return cleaned


def _convert_legacy(payload: bytes, filename: str, target: str) -> tuple[bytes, str]:
    suffix = Path(filename).suffix.lower()
    stem = Path(filename).stem[:90] or "document"
    with tempfile.TemporaryDirectory(prefix="salon-clean-") as td:
        source = Path(td) / f"source{suffix}"
        source.write_bytes(payload)
        import subprocess
        run = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", target,
             "--outdir", td, str(source)], capture_output=True, timeout=90)
        produced = Path(td) / f"source.{target}"
        if run.returncode or not produced.exists():
            raise ValueError("legacy_conversion_failed")
        return produced.read_bytes(), f"{stem}.{target}"


def _clean_sync(payload: bytes, filename: str) -> tuple[bytes, str, str]:
    ext = Path(filename).suffix.lower()
    clean_name = os.path.basename(filename)[:120] or "file"
    if ext == ".pdf":
        return _sanitize_pdf(payload), clean_name, "pdf_metadata"
    if ext in _OFFICE or ext == ".odt":
        return _sanitize_zip(payload, ext), clean_name, "office_metadata"
    if ext in (".doc", ".rtf"):
        converted, clean_name = _convert_legacy(payload, filename, "docx")
        return _sanitize_zip(converted, ".docx"), clean_name, "converted_docx"
    if ext == ".ppt":
        converted, clean_name = _convert_legacy(payload, filename, "pptx")
        return _sanitize_zip(converted, ".pptx"), clean_name, "converted_pptx"
    if ext == ".txt":
        return payload, clean_name, "plain_text"
    raise ValueError("unsupported_format")


async def clean(payload: bytes, filename: str) -> tuple[bytes, str, str]:
    """Возвращает (очищенные байты, безопасное имя, метод очистки)."""
    return await asyncio.to_thread(_clean_sync, payload, filename)
