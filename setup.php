<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

function move_all($src, $dest) {
    if (!is_dir($src)) return;
    $files = scandir($src);
    foreach ($files as $file) {
        if ($file == '.' || $file == '..') continue;
        
        $srcPath = $src . DIRECTORY_SEPARATOR . $file;
        $destPath = $dest . DIRECTORY_SEPARATOR . $file;
        
        echo "Moving $srcPath to $destPath... <br>";
        if (rename($srcPath, $destPath)) {
            echo "Success<br>";
        } else {
            echo "Failed<br>";
        }
    }
}

// Move from Documents/Maiyuri_Bricks_App to root
move_all('Documents/Maiyuri_Bricks_App', '.');

// If apps/web/.next exists, we might want to move it too if it's still nested
// But moving Documents/Maiyuri_Bricks_App should be enough to get the 'apps' and 'node_modules' to root

// Remove Hostinger default
if (file_exists('default.php')) {
    unlink('default.php');
    echo "Removed default.php<br>";
}

echo "Setup complete.";
?>
