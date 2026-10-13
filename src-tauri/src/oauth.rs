use crate::models::Settings;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
#[derive(Clone, Serialize, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("QUANTA", "google-drive")
        .map_err(|_| "The system credential store is unavailable.".into())
}
pub fn load_tokens() -> Result<Option<Tokens>, String> {
    match entry()?.get_password() {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|_| {
            "The saved Google authorization is damaged. Reconnect Google Drive.".into()
        }),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("The system credential store is locked or unavailable.".into()),
    }
}
pub fn save_tokens(tokens: &Tokens) -> Result<(), String> {
    entry()?
        .set_password(
            &serde_json::to_string(tokens).map_err(|_| "Cannot encode Google authorization.")?,
        )
        .map_err(|_| "Could not save authorization in the system credential store.".into())
}
pub fn disconnect() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the saved Google authorization.".into()),
    }
}
pub fn http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(45))
        .user_agent("QUANTA/0.1")
        .build()
        .map_err(|e| e.to_string())
}
fn random_url_string() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
pub fn validate_client(settings: &Settings) -> Result<(), String> {
    if !settings
        .google_client_id
        .trim()
        .ends_with(".apps.googleusercontent.com")
    {
        return Err("Import your Google Desktop OAuth credentials in Settings first. No .env file is needed.".into());
    }
    Ok(())
}
pub fn callback_code(target: &str, expected_state: &str) -> Result<String, String> {
    let url = url::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "Invalid Google callback.")?;
    if url.path() != "/oauth2callback" {
        return Err("Not an OAuth callback.".into());
    }
    let query = url
        .query_pairs()
        .collect::<std::collections::HashMap<_, _>>();
    if query.get("state").map(|s| s.as_ref()) != Some(expected_state) {
        return Err("The Google authorization state did not match. Try connecting again.".into());
    }
    if query.contains_key("error") {
        return Err("Google authorization was cancelled or declined.".into());
    }
    query
        .get("code")
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .ok_or("Google did not return an authorization code.".into())
}
pub async fn connect(settings: &Settings) -> Result<(Tokens, String), String> {
    validate_client(settings)?;
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|_| "Could not open a local Google sign-in callback.")?;
    let redirect = format!(
        "http://127.0.0.1:{}/oauth2callback",
        listener.local_addr().map_err(|e| e.to_string())?.port()
    );
    let verifier = random_url_string();
    let state = random_url_string();
    let mut url = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", settings.google_client_id.trim()),
        ("redirect_uri", &redirect),
        ("response_type", "code"),
        (
            "scope",
            "https://www.googleapis.com/auth/drive.file openid email",
        ),
        ("access_type", "offline"),
        ("prompt", "consent select_account"),
        ("code_challenge", &pkce_challenge(&verifier)),
        ("code_challenge_method", "S256"),
        ("state", &state),
    ]);
    open::that(url.as_str())
        .map_err(|_| "Could not open your default browser for Google sign-in.")?;
    let code = tokio::time::timeout(Duration::from_secs(180),async {
        loop {
            let (mut stream, _) = listener.accept().await.map_err(|_| "The Google callback listener stopped.")?;
            let mut bytes=Vec::new(); let mut buffer=[0u8;2048];
            let read_result=tokio::time::timeout(Duration::from_secs(5),async {
                while bytes.len()<16384 {
                    let n=stream.read(&mut buffer).await.map_err(|_| "Cannot read the sign-in callback.")?;
                    if n==0 {break;} bytes.extend_from_slice(&buffer[..n]); if bytes.windows(4).any(|w|w==b"\r\n\r\n") {break;}
                } Ok::<(),String>(())
            }).await;
            if !matches!(read_result,Ok(Ok(()))) {continue;}
            let request=String::from_utf8_lossy(&bytes); let target=request.lines().next().and_then(|l|l.strip_prefix("GET ")).and_then(|l|l.split_whitespace().next()).unwrap_or("");
            if !target.starts_with("/oauth2callback?") {
                let _=stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await; continue;
            }
            let result=callback_code(target,&state);
            let body=if result.is_ok(){"<!doctype html><title>QUANTA connected</title><body style='font:18px system-ui;padding:60px;background:#edf1f5;color:#23364c'><h1>You're connected.</h1><p>You can return to QUANTA and close this tab.</p></body>"}else{"<!doctype html><title>QUANTA sign-in</title><p>Sign-in was not completed. Return to QUANTA to try again.</p>"};
            let response=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body);
            let _=stream.write_all(response.as_bytes()).await;
            return result;
        }
    }).await.map_err(|_| "Google sign-in timed out. Try connecting again.")??;
    let client = http_client()?;
    let mut fields = vec![
        ("code", code),
        ("client_id", settings.google_client_id.trim().into()),
        ("redirect_uri", redirect),
        ("grant_type", "authorization_code".into()),
        ("code_verifier", verifier),
    ];
    if !settings.google_client_secret.is_empty() {
        fields.push(("client_secret", settings.google_client_secret.clone()));
    }
    let response = client
        .post(TOKEN_URL)
        .form(&fields)
        .send()
        .await
        .map_err(|_| "Could not reach Google to complete sign-in.")?;
    if !response.status().is_success() {
        return Err("Google rejected the desktop OAuth client. Check the imported client type and your consent-screen configuration.".into());
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| "Google returned an invalid authorization response.")?;
    let tokens=Tokens {
        access_token:value["access_token"].as_str().ok_or("Google did not return an access token.")?.into(),
        refresh_token:value["refresh_token"].as_str().ok_or("Google did not grant offline access. Remove QUANTA's authorization in your Google account, then reconnect.")?.into(),
        expires_at:now()+value["expires_in"].as_u64().unwrap_or(3600),
    };
    let profile: Value = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|_| "Could not read the connected Google account.")?
        .error_for_status()
        .map_err(|_| "Google did not grant account identification.")?
        .json()
        .await
        .map_err(|_| "Invalid Google account response.")?;
    let account = profile["email"]
        .as_str()
        .ok_or("Google did not return an account email.")?
        .to_string();
    save_tokens(&tokens)?;
    Ok((tokens, account))
}
pub async fn access_token(settings: &Settings) -> Result<String, String> {
    let mut tokens = load_tokens()?.ok_or("Connect Google Drive in Settings first.")?;
    if tokens.expires_at > now() + 90 {
        return Ok(tokens.access_token);
    }
    validate_client(settings)?;
    let mut fields = vec![
        ("client_id", settings.google_client_id.clone()),
        ("refresh_token", tokens.refresh_token.clone()),
        ("grant_type", "refresh_token".into()),
    ];
    if !settings.google_client_secret.is_empty() {
        fields.push(("client_secret", settings.google_client_secret.clone()));
    }
    let response = http_client()?
        .post(TOKEN_URL)
        .form(&fields)
        .send()
        .await
        .map_err(|_| "Google is unreachable. Your files remain saved locally.")?;
    if !response.status().is_success() {
        return Err(
            "Google authorization expired or was revoked. Reconnect Google Drive in Settings."
                .into(),
        );
    }
    let v: Value = response
        .json()
        .await
        .map_err(|_| "Google returned an invalid token response.")?;
    tokens.access_token = v["access_token"]
        .as_str()
        .ok_or("Google did not return an access token.")?
        .into();
    tokens.expires_at = now() + v["expires_in"].as_u64().unwrap_or(3600);
    save_tokens(&tokens)?;
    Ok(tokens.access_token)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pkce_matches_rfc7636_vector() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
    #[test]
    fn callback_rejects_wrong_state_and_missing_code() {
        assert_eq!(
            callback_code("/oauth2callback?state=correct&code=abc", "correct").unwrap(),
            "abc"
        );
        assert!(callback_code("/oauth2callback?state=wrong&code=abc", "correct").is_err());
        assert!(callback_code(
            "/oauth2callback?state=correct&error=access_denied",
            "correct"
        )
        .is_err());
        assert!(callback_code("/elsewhere?state=correct&code=abc", "correct").is_err());
    }
}
