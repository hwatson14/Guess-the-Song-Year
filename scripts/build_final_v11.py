#!/usr/bin/env python3
"""Final production entrypoint for six-playlist Guess the Song Year v11."""
import assemble_playlists_v11
import finalize_runtime_v11


def main():
    assemble_playlists_v11.main()
    # The assembler deliberately owns catalogue/schema/UI composition; this final pass
    # ensures runtime identity exactly tracks the latest canonical version rules.
    finalize_runtime_v11.main()
    print('Final v11 six-playlist build complete')


if __name__=='__main__':
    main()
