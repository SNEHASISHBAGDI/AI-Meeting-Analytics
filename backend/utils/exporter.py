import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf_report(meeting_data: dict, output_path: str) -> str:
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=40, leftMargin=40,
        topMargin=40, bottomMargin=40
    )
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        textColor=colors.HexColor('#7c3aed'),
        spaceAfter=12
    )
    
    heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        textColor=colors.HexColor('#06b6d4'),
        spaceBefore=10,
        spaceAfter=4
    )
    
    body_style = ParagraphStyle(
        'ReportBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.HexColor('#111118'),
        leading=13,
        spaceAfter=6
    )

    story = []
    
    title = meeting_data.get("title", "Meeting Intelligence Report")
    story.append(Paragraph(title, title_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor('#7c3aed'), spaceAfter=10))
    
    story.append(Paragraph("Executive Summary", heading_style))
    for line in meeting_data.get("summary", "").split("\n"):
        if line.strip():
            story.append(Paragraph(f"• {line.strip().lstrip('•-* ')}", body_style))
            
    story.append(Paragraph("Action Items", heading_style))
    for line in meeting_data.get("action_items", "").split("\n"):
        if line.strip():
            story.append(Paragraph(line.strip(), body_style))

    story.append(Paragraph("Key Decisions", heading_style))
    for line in meeting_data.get("decisions", "").split("\n"):
        if line.strip():
            story.append(Paragraph(line.strip(), body_style))

    story.append(Paragraph("Open Questions & Follow-ups", heading_style))
    for line in meeting_data.get("questions", "").split("\n"):
        if line.strip():
            story.append(Paragraph(line.strip(), body_style))

    doc.build(story)
    return output_path