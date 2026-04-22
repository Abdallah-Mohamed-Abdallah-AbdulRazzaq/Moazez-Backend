# auth

## Endpoints
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /applicants/temporary-account`
- `POST /auth/logout`

## Login Request
```json
{
  "identity": "string",
  "password": "string",
  "remember_me": true
}
```

## Login Response
```json
{
  "token": "string",
  "refresh_token": "string",
  "user_type": "parent",
  "user_id": "string",
  "full_name": "string"
}
```

## Forgot Password Request
```json
{
  "contact": "string"
}
```

## Quick Apply Account Request
```json
{
  "full_name": "string",
  "phone_number": "string",
  "email": "string",
  "city": "string",
  "relationship": "father|mother|guardian|relative",
  "password": "string"
}
```

## Quick Apply Account Response
```json
{
  "id": "string",
  "token": "string",
  "full_name": "string"
}
```
