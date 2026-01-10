<?php
function list_dir($dir) {
    echo "<h3>Listing $dir</h3><ul>";
    if (is_dir($dir)) {
        if ($dh = opendir($dir)) {
            while (($file = readdir($dh)) !== false) {
                if ($file != "." && $file != "..") {
                    $fullpath = $dir . DIRECTORY_SEPARATOR . $file;
                    echo "<li>" . (is_dir($fullpath) ? "[DIR] " : "") . $file . "</li>";
                    if (is_dir($fullpath) && substr_count($fullpath, DIRECTORY_SEPARATOR) < 5) {
                        // list_dir($fullpath); // recursive but limited
                    }
                }
            }
            closedir($dh);
        }
    } else {
        echo "Not a directory";
    }
    echo "</ul>";
}

list_dir('.');
if (is_dir('Documents')) list_dir('Documents');
if (is_dir('Documents/Maiyuri_Bricks_App')) list_dir('Documents/Maiyuri_Bricks_App');
if (is_dir('Documents/Maiyuri_Bricks_App/apps')) list_dir('Documents/Maiyuri_Bricks_App/apps');
if (is_dir('Documents/Maiyuri_Bricks_App/apps/web')) list_dir('Documents/Maiyuri_Bricks_App/apps/web');
?>
