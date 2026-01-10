<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

function moveRecursive($src, $dst) {
    if (!file_exists($src)) {
        echo "Source not found: $src<br>";
        return;
    }
    if (is_dir($src)) {
        if (!is_dir($dst)) mkdir($dst, 0777, true);
        $files = scandir($src);
        foreach ($files as $file) {
            if ($file != "." && $file != "..") {
                moveRecursive("$src/$file", "$dst/$file");
            }
        }
        echo "Copied directory $src to $dst<br>";
    } else {
        copy($src, $dst);
        echo "Copied file $src to $dst<br>";
    }
}

// Move server.js to root
moveRecursive('Documents/Maiyuri_Bricks_App/apps/web/server.js', 'server.js');

// Move .next to root
moveRecursive('Documents/Maiyuri_Bricks_App/apps/web/.next', '.next');

// Move each file from public to ROOT (not as a subdirectory)
$publicDir = 'Documents/Maiyuri_Bricks_App/apps/web/public';
if (is_dir($publicDir)) {
    $files = scandir($publicDir);
    foreach ($files as $file) {
        if ($file != "." && $file != "..") {
            $src = "$publicDir/$file";
            $dst = $file; // Directly in root
            if (is_file($src)) {
                copy($src, $dst);
                echo "Copied PWA asset $file to root<br>";
            }
        }
    }
} else {
    echo "Public directory not found: $publicDir<br>";
}

echo "<br><strong>Flattening complete.</strong>";
?>
