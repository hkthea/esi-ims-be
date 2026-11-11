import fs from "fs";
import path from "path";
export interface VersionItem {
    version: string;
    description: string;
}

const readFileInfo = (): VersionItem[] | null => {
    const filePath = path.resolve(process.cwd(), "version.json");
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw) as VersionItem[];
        return Array.isArray(parsed) ? parsed : null;
    } catch (err) {
        return null;
    }
};

export const getVersionHistory = (): VersionItem[] => {
    const fileInfo = readFileInfo();
    return fileInfo ?? [];
};
