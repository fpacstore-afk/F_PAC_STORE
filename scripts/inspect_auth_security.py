"""Read only non-account security settings using the existing deployment identity."""
import json
import subprocess
import urllib.error
import urllib.request


def inspect():
    token = subprocess.run(
        ["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True
    ).stdout.strip()
    url = (
        "https://identitytoolkit.googleapis.com/admin/v2/projects/fpac-store62/config"
        "?fields=mfa,emailPrivacyConfig,passwordPolicyConfig,recaptchaConfig"
    )
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=20) as response:
        config = json.load(response)
    recaptcha = config.get("recaptchaConfig", {})
    mfa = config.get("mfa", {})
    return {
        "status": "read",
        "mfaState": mfa.get("state", "UNSPECIFIED"),
        "mfaProviders": mfa.get("enabledProviders", []),
        "totpConfigured": any("totpProviderConfig" in item for item in mfa.get("providerConfigs", [])),
        "emailPrivacy": config.get("emailPrivacyConfig", {}),
        "passwordPolicy": config.get("passwordPolicyConfig", {}),
        "recaptchaEnforcement": {
            key: recaptcha[key]
            for key in ["emailPasswordEnforcementState", "phoneEnforcementState"]
            if key in recaptcha
        },
    }


try:
    result = inspect()
except urllib.error.HTTPError as error:
    # Do not log response bodies, auth headers, tokens, account lists or provider secrets.
    result = {"status": "not_verified", "httpStatus": error.code,
              "requiredReadPermission": "firebaseauth.configs.get"}
except Exception:
    result = {"status": "not_verified", "reason": "configuration_read_unavailable"}
print("AUTH_SECURITY_CONFIGURATION " + json.dumps(result, sort_keys=True))
