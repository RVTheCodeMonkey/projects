import sys

import jpype
import mpxj


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: convert_to_xml.py <input> <output.xml>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    jpype.startJVM()
    try:
        from org.mpxj.sample import MpxjConvert
        MpxjConvert().process(input_path, output_path)
    finally:
        jpype.shutdownJVM()


if __name__ == "__main__":
    main()
