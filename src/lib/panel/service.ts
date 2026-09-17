import { getPanelRepository } from "@/lib/db";
import { downloadPanelMedia } from "@/lib/meta/client";
import { storePrivateFile } from "./files";
import { createIncomingCapture } from "./incoming";

export const incomingAssets=createIncomingCapture({repository:getPanelRepository,download:downloadPanelMedia,store:storePrivateFile});
