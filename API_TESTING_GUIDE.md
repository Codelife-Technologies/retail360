# API Testing Guide for `/api/categories`

## Prerequisites
1. Make sure your server is running: `node server/server.js` or `npm start`
2. Ensure MongoDB is connected and running

## Method 1: Browser (GET requests only)
Simply open in your browser:
```
http://localhost:5000/api/categories
```

## Method 2: PowerShell Commands

### GET all categories
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/categories" -Method GET | Select-Object -ExpandProperty Content
```

### GET all categories (formatted JSON)
```powershell
(Invoke-WebRequest -Uri "http://localhost:5000/api/categories" -Method GET).Content | ConvertFrom-Json | ConvertTo-Json
```

### GET single category (replace ID)
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/categories/YOUR_CATEGORY_ID" -Method GET | Select-Object -ExpandProperty Content
```

### POST create category
```powershell
$body = @{
    name = "Test Category"
    hsnCode = "123456"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5000/api/categories" -Method POST -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content
```

### PUT update category
```powershell
$body = @{
    name = "Updated Category Name"
    hsnCode = "123456"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5000/api/categories/YOUR_CATEGORY_ID" -Method PUT -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content
```

### DELETE category
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/categories/YOUR_CATEGORY_ID" -Method DELETE | Select-Object -ExpandProperty Content
```

## Method 3: Using curl (if available)
```bash
# GET all categories
curl http://localhost:5000/api/categories

# GET with pretty print
curl http://localhost:5000/api/categories | python -m json.tool

# POST create category
curl -X POST http://localhost:5000/api/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Category","hsnCode":"123456"}'

# GET single category
curl http://localhost:5000/api/categories/YOUR_CATEGORY_ID

# PUT update category
curl -X PUT http://localhost:5000/api/categories/YOUR_CATEGORY_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name","hsnCode":"123456"}'

# DELETE category
curl -X DELETE http://localhost:5000/api/categories/YOUR_CATEGORY_ID
```

## Method 4: Using Postman or Thunder Client (VS Code Extension)
1. **GET** `http://localhost:5000/api/categories`
2. **POST** `http://localhost:5000/api/categories`
   - Body (JSON):
   ```json
   {
     "name": "Test Category",
     "hsnCode": "123456"
   }
   ```
3. **GET** `http://localhost:5000/api/categories/:id` (replace `:id` with actual ID)
4. **PUT** `http://localhost:5000/api/categories/:id`
5. **DELETE** `http://localhost:5000/api/categories/:id`

## Method 5: Query Parameters
- **Search**: `http://localhost:5000/api/categories?search=electronics`
- **Pagination**: `http://localhost:5000/api/categories?page=1&limit=10`
- **Combined**: `http://localhost:5000/api/categories?search=test&page=1&limit=5`

## Expected Responses

### GET /api/categories (Success)
```json
[
  {
    "_id": "...",
    "name": "Category Name",
    "hsnCode": "123456",
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### POST /api/categories (Success - 201)
```json
{
  "_id": "...",
  "name": "New Category",
  "hsnCode": "123456",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Error Response (400/404/500)
```json
{
  "error": "Error message here"
}
```

## Health Check
Test if server is running:
```
http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "database": "Connected"
}
```

