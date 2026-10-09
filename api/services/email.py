import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from fastapi import Request

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def is_email_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS)


def _build_base_url(request: Optional[Request] = None) -> str:
    configured = settings.APP_BASE_URL
    if configured:
        return configured.rstrip("/")
    if request is None:
        return ""
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("host") or request.url.hostname or "localhost"
    return f"{scheme}://{host}"


def _get_server_cls(port: int):
    if port == 465:
        return smtplib.SMTP_SSL
    return smtplib.SMTP


def _send_link_email(
    to_email: str,
    subject: str,
    link: str,
    intro_text: str,
    intro_html: str,
    action_text: str,
    expiry_text: str,
) -> None:
    text = f"""Hi,

{intro_text}

{action_text}:

{link}

{expiry_text}
"""
    html = f"""<p>Hi,</p>
<p>{intro_html}</p>
<p>{action_text} using the link below:</p>
<p><a href="{link}">{link}</a></p>
<p>{expiry_text}</p>
"""

    if not is_email_configured():
        logger.info(
            "[DEV] Email would be sent.\n"
            f"To: {to_email}\n"
            f"Subject: {subject}\n"
            f"Link: {link}\n"
        )
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    host = settings.SMTP_HOST
    port = settings.SMTP_PORT
    user = settings.SMTP_USER
    password = settings.SMTP_PASS
    server_cls = _get_server_cls(port)

    try:
        with server_cls(host, port, timeout=30) as server:
            if port != 465:
                server.starttls()
            server.login(user, password)
            server.send_message(msg)
    except Exception as exc:
        logger.exception("Failed to send email to %s: %s", to_email, exc)
        raise


def send_project_invite_email(
    to_email: str,
    project_name: str,
    token: str,
    role: str,
    request: Optional[Request] = None,
    base_url: Optional[str] = None,
) -> None:
    base_url = (base_url or _build_base_url(request) or "https://projects.corebase.be").rstrip("/")
    link = f"{base_url}/invite/{token}"
    _send_link_email(
        to_email=to_email,
        subject=f"You have been invited to {project_name}",
        link=link,
        intro_text=f"You have been invited to join the project \"{project_name}\" as a {role}.",
        intro_html=f"You have been invited to join the project <strong>{project_name}</strong> as a <strong>{role}</strong>.",
        action_text="Please register using this email address and set your password",
        expiry_text="This invitation link expires in 7 days.",
    )


def send_password_set_email(
    to_email: str,
    token: str,
    request: Optional[Request] = None,
    base_url: Optional[str] = None,
) -> None:
    base_url = (base_url or _build_base_url(request) or "https://projects.corebase.be").rstrip("/")
    link = f"{base_url}/set-password?token={token}"
    _send_link_email(
        to_email=to_email,
        subject="Set your CoreBase Projects password",
        link=link,
        intro_text="A CoreBase Projects account has been created for you.",
        intro_html="A CoreBase Projects account has been created for you.",
        action_text="Please set your password using the link below",
        expiry_text="This link expires in 7 days.",
    )
