//create and verify jwt token
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import config from "../config";

export const generateToken = (payload: JwtPayload , secret: string , expiresIn: SignOptions["expiresIn"]) => {
    return jwt.sign(payload, secret , {
        expiresIn
    } as SignOptions)
}

export const verifyToken = (token: string , secret: string) => {
    try {
        const verifiedToken = jwt.verify(token, secret);
        return {
            success: true,
            data: verifiedToken
        };
   } catch (error : any) {
        console.log("Token verification failed:", error);
        return {
            success: false,
            error : error.message
        }
   }
}