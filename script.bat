@echo off
REM =========================================================
REM Scaffold E-Commerce Express + HBS + Mongo (estructura)
REM Uso: double-click o ejecutar desde CMD en carpeta destino
REM =========================================================

SETLOCAL ENABLEDELAYEDEXPANSION

REM Carpetas raíz
mkdir public\css
mkdir public\js
mkdir public\img

mkdir src\config
mkdir src\controllers
mkdir src\middlewares
mkdir src\models
mkdir src\routes
mkdir src\services
mkdir src\utils
mkdir src\views\layouts
mkdir src\views\partials
mkdir src\seed

mkdir tests

REM Archivos raíz
type NUL > README.md
type NUL > .gitignore
type NUL > .gitattributes
type NUL > .editorconfig
type NUL > .prettierrc.json
type NUL > .eslintrc.json
type NUL > nodemon.json
type NUL > .env.example

REM Archivos públicos
type NUL > public\css\styles.css
type NUL > public\js\app.js

REM Archivos src mínimo
type NUL > src\app.js

type NUL > src\config\env.js
type NUL > src\config\db.js
type NUL > src\config\cloudinary.js

type NUL > src\middlewares\auth.js
type NUL > src\middlewares\errors.js

type NUL > src\models\User.js
type NUL > src\models\Product.js
type NUL > src\models\Order.js

type NUL > src\controllers\auth.controller.js
type NUL > src\controllers\product.controller.js
type NUL > src\controllers\cart.controller.js
type NUL > src\controllers\order.controller.js
type NUL > src\controllers\admin.controller.js

type NUL > src\routes\index.js
type NUL > src\routes\auth.js
type NUL > src\routes\products.js
type NUL > src\routes\cart.js
type NUL > src\routes\checkout.js
mkdir src\routes\admin
type NUL > src\routes\admin\products.js
type NUL > src\routes\admin\users.js
type NUL > src\routes\admin\orders.js

type NUL > src\services\mp.service.js
type NUL > src\services\image.service.js
type NUL > src\services\cart.service.js

type NUL > src\utils\format.js

type NUL > src\seed\seed.js

type NUL > src\views\layouts\main.hbs
type NUL > src\views\home.hbs
type NUL > src\views\login.hbs
type NUL > src\views\register.hbs
type NUL > src\views\cart.hbs
type NUL > src\views\checkout.hbs
type NUL > src\views\404.hbs
type NUL > src\views\error.hbs

type NUL > src\views\partials\navbar.hbs
type NUL > src\views\partials\footer.hbs
type NUL > src\views\partials\flash.hbs
type NUL > src\views\partials\product-card.hbs

REM Semillas default en .env.example
echo PORT=3000>> .env.example
echo NODE_ENV=development>> .env.example
echo MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/ecommerce>> .env.example
echo SESSION_SECRET=cambia-esto>> .env.example
echo MP_ACCESS_TOKEN=TEST-xxxxxxxx>> .env.example
echo MP_PUBLIC_KEY=TEST-xxxxxxxx>> .env.example
echo CLOUDINARY_CLOUD_NAME=tu_cloud>> .env.example
echo CLOUDINARY_API_KEY=xxxx>> .env.example
echo CLOUDINARY_API_SECRET=xxxx>> .env.example

REM .gitignore común
echo node_modules/>> .gitignore
echo .env>> .gitignore
echo npm-debug.log*>> .gitignore
echo yarn-error.log*>> .gitignore
echo .DS_Store>> .gitignore

REM .gitattributes
echo * text=auto eol=lf>> .gitattributes

REM .editorconfig
echo root = true>> .editorconfig
echo [*]>> .editorconfig
echo charset = utf-8>> .editorconfig
echo end_of_line = lf>> .editorconfig
echo insert_final_newline = true>> .editorconfig
echo indent_style = space>> .editorconfig
echo indent_size = 2>> .editorconfig

REM Prettier
echo {^"singleQuote^": true, ^"semi^": true, ^"printWidth^": 100} > .prettierrc.json

REM ESLint básico (ESM, node)
echo {^
  ^"env^": { ^"es2022^": true, ^"node^": true },^
  ^"extends^": [^"eslint:recommended^"],^
  ^"parserOptions^": { ^"ecmaVersion^": 2022, ^"sourceType^": ^"module^" },^
  ^"rules^": { ^"no-unused-vars^": [^"warn^", { ^"argsIgnorePattern^": ^"^_^" }] }^
} > .eslintrc.json

REM nodemon
echo {^"watch^":[^"src^"],^"ext^":^"js,json,hbs^",^"exec^":^"node src/app.js^"} > nodemon.json

echo.
echo ✅ Estructura creada. Continua con: npm init -y ^& npm i ...
echo.
ENDLOCAL
